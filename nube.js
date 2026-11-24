"use strict";

/* =========================================================
   Guardado automático en una hoja de Google Sheets.
   La hoja tiene un pequeño script (google-script.gs) publicado como
   «aplicación web»; la app le envía los viajes y cobros y los lee.
   El móvil guarda siempre una copia, así que funciona sin cobertura.
   ========================================================= */

const Nube = (() => {
  const CLAVE_CONF = "kilometraje.google";
  let conf = leerConf(); // { url, clave, version, hojaUrl, ultimaSync }
  let estado = "";
  let enCurso = null, pendiente = false, espera;

  function leerConf() {
    try { return JSON.parse(localStorage.getItem(CLAVE_CONF)) || null; } catch (e) { return null; }
  }
  function guardarConf() {
    try { conf ? localStorage.setItem(CLAVE_CONF, JSON.stringify(conf)) : localStorage.removeItem(CLAVE_CONF); } catch (e) {}
  }
  const conectada = () => !!conf?.url;

  /* ---------- Llamadas al script ---------- */

  async function llamar(url, clave, cuerpo) {
    const r = await fetch(url, {
      method: "POST",
      // text/plain evita la comprobación previa (CORS) que Apps Script no admite
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ clave, ...cuerpo }),
    });
    if (!r.ok) throw new Error("http " + r.status);
    const j = await r.json().catch(() => { throw new Error("respuesta"); });
    if (j.error) throw new Error(j.error);
    return j;
  }

  /* ---------- Hoja ⇄ datos ---------- */

  // Cada columna: nombre, formato, ancho y cómo se obtiene. Las columnas nuevas van siempre al final:
  // el script de la hoja oculta columnas por posición, así las de hojas antiguas no se descolocan.
  const F = { fecha: "dd/mm/yyyy", texto: "@", km: "#,##0.0", euro: '#,##0.00 "€"', num: "0" };
  const COLS_VIAJES = [
    ["Fecha", F.fecha, 90, (v) => v.fecha],
    ["Destino", F.texto, 160, (v) => v.destino],
    ["Motivo", F.texto, 200, (v) => v.motivo],
    ["Km", F.km, 70, (v) => v.km],
    ["Importe", F.euro, 90, (v, l, t) => redondear(v.km * (l ? l.tarifa : t))],
    ["Estado", F.texto, 85, (v, l) => (l ? (l.pagada ? "Pagado" : "Pedido") : "Pendiente")],
    ["Pedido el", F.fecha, 90, (v, l) => l?.fecha || ""],
    ["Pagado el", F.fecha, 90, (v, l) => l?.pagada || ""],
    ["id", F.texto, 80, (v) => v.id, "oculta"],
    ["cobro", F.texto, 80, (v) => v.liq || "", "oculta"],
    ["mod", F.num, 80, (v) => v.mod || 0, "oculta"],
    ["Descripción", F.texto, 300, (v) => v.descripcion || ""],
  ];
  const COLS_COBROS = [
    ["Pedido el", F.fecha, 90, (l) => l.fecha],
    ["Viajes", F.num, 60, (l) => l.viajes.length],
    ["Km", F.km, 80, (l) => l.km],
    ["€/km", F.euro, 70, (l) => l.tarifa],
    ["Importe", F.euro, 90, (l) => l.importe],
    ["Estado", F.texto, 85, (l) => (l.pagada ? "Pagado" : "Pedido")],
    ["Pagado el", F.fecha, 90, (l) => l.pagada || ""],
    ["id", F.texto, 80, (l) => l.id, "oculta"],
    ["mod", F.num, 80, (l) => l.mod || 0, "oculta"],
    ["ids viajes", F.texto, 120, (l) => l.viajes.join(","), "oculta"],
  ];
  // Columnas de las hojas creadas antes de guardar su lista en la hoja
  const COLS_ANTIGUAS = {
    Viajes: ["Fecha", "Destino", "Motivo", "Km", "Importe", "Estado", "Pedido el", "Pagado el", "id", "cobro", "mod"],
    Cobros: ["Pedido el", "Viajes", "Km", "€/km", "Importe", "Estado", "Pagado el", "id", "mod", "ids viajes"],
  };

  function hoja(cols, filas) {
    return {
      cabecera: cols.map((c) => c[0]),
      formatos: cols.map((c) => c[1]),
      anchos: cols.map((c) => c[2]),
      ocultas: cols.flatMap((c, i) => (c[4] === "oculta" ? [i] : [])),
      fechas: cols.flatMap((c, i) => (c[1] === F.fecha ? [i] : [])),
      filas,
    };
  }

  function aHojas(d) {
    const liqPorId = new Map(d.liquidaciones.map((l) => [l.id, l]));
    const viajes = [...d.viajes].sort((a, b) => b.fecha.localeCompare(a.fecha) || b.mod - a.mod);
    const cobros = [...d.liquidaciones].sort((a, b) => b.fecha.localeCompare(a.fecha));
    return {
      Viajes: hoja(COLS_VIAJES, viajes.map((v) => COLS_VIAJES.map((c) => c[3](v, liqPorId.get(v.liq), d.ajustes.tarifa)))),
      Cobros: hoja(COLS_COBROS, cobros.map((l) => COLS_COBROS.map((c) => c[3](l)))),
    };
  }

  /** Lee las filas por el nombre de cada columna. */
  function porNombre(r, nombre) {
    const cols = r.extra.columnas?.[nombre] || COLS_ANTIGUAS[nombre];
    return (r.hojas[nombre] || []).map((f) => Object.fromEntries(cols.map((c, i) => [c, f[i] ?? ""])));
  }

  function deHojas(r) {
    const viajes = porNombre(r, "Viajes").filter((f) => f.id).map((f) => ({
      id: String(f.id), fecha: String(f.Fecha), destino: String(f.Destino), motivo: String(f.Motivo),
      descripcion: String(f["Descripción"] ?? ""), km: Number(f.Km) || 0, liq: f.cobro ? String(f.cobro) : null, mod: Number(f.mod) || 0,
    }));
    const liquidaciones = porNombre(r, "Cobros").filter((f) => f.id).map((f) => ({
      id: String(f.id), fecha: String(f["Pedido el"]), km: Number(f.Km) || 0, tarifa: Number(f["€/km"]) || 0, importe: Number(f.Importe) || 0,
      pagada: f["Pagado el"] ? String(f["Pagado el"]) : null, mod: Number(f.mod) || 0, viajes: String(f["ids viajes"] || "").split(",").filter(Boolean),
    }));
    return normalizar({ viajes, liquidaciones, ajustes: r.extra.ajustes, borrados: r.extra.borrados });
  }

  const extra = (d) => ({
    ajustes: d.ajustes,
    borrados: d.borrados,
    columnas: { Viajes: COLS_VIAJES.map((c) => c[0]), Cobros: COLS_COBROS.map((c) => c[0]) },
  });

  /* ---------- Combinar (por si se usa en dos dispositivos) ---------- */

  function combinar(a, b) {
    const borrados = { ...b.borrados };
    for (const [id, t] of Object.entries(a.borrados)) borrados[id] = Math.max(t, borrados[id] || 0);
    // Los borrados solo hacen falta un tiempo, para avisar a otros dispositivos: se olvidan a los 120 días
    const limite = Date.now() - 120 * 864e5;
    for (const [id, t] of Object.entries(borrados)) if (t < limite) delete borrados[id];
    const unir = (x, y) => {
      const m = new Map();
      for (const r of [...y, ...x]) { // en empate gana el móvil
        const prev = m.get(r.id);
        if (!prev || (r.mod || 0) >= (prev.mod || 0)) m.set(r.id, r);
      }
      return [...m.values()].filter((r) => !(borrados[r.id] >= (r.mod || 0)));
    };
    return normalizar({
      ...a,
      ajustes: (b.ajustes.mod || 0) > (a.ajustes.mod || 0) ? b.ajustes : a.ajustes,
      viajes: unir(a.viajes, b.viajes),
      liquidaciones: unir(a.liquidaciones, b.liquidaciones),
      borrados,
    });
  }

  // Huella para comparar: mismos campos y en el mismo orden, venga de donde venga
  const porId = (l) => [...l].sort((x, y) => x.id.localeCompare(y.id));
  const huella = (d) => JSON.stringify([
    [d.ajustes.nombre, d.ajustes.correo, d.ajustes.tarifa, d.ajustes.mod || 0],
    porId(d.viajes).map((v) => [v.id, v.fecha, v.destino, v.motivo || "", v.descripcion || "", v.km, v.liq || null, v.mod || 0]),
    porId(d.liquidaciones).map((l) => [l.id, l.fecha, l.km, l.tarifa, l.importe, l.pagada || null, l.mod || 0, l.viajes.join(",")]),
    Object.keys(d.borrados).sort(),
  ]);

  /* ---------- Sincronizar ---------- */

  async function sincronizar() {
    if (!conectada()) return pintarEstado();
    if (!navigator.onLine) { estado = "sin-conexion"; return pintarEstado(); }
    if (enCurso) { pendiente = true; return enCurso; }
    estado = "trabajando";
    pintarEstado();
    enCurso = (async () => {
      try {
        let r = await llamar(conf.url, conf.clave, { accion: "leer" });
        for (let intento = 0; intento < 4; intento++) {
          const remoto = deHojas(r);
          const combinado = combinar(datos, remoto);
          if (huella(combinado) !== huella(datos)) { datos = combinado; guardar({ sincronizar: false }); }
          conf.hojaUrl = r.url;
          if (huella(combinado) === huella(remoto)) { conf.version = r.version; break; }
          const w = await llamar(conf.url, conf.clave, { accion: "escribir", base: r.version, hojas: aHojas(datos), extra: extra(datos) });
          if (!w.conflicto) { conf.version = w.version; break; }
          r = w; // otro dispositivo escribió a la vez: combinar de nuevo
        }
        conf.ultimaSync = Date.now();
        guardarConf();
        estado = "ok";
      } catch (e) {
        estado = !navigator.onLine ? "sin-conexion" : e.message === "clave" ? "clave" : "error";
      } finally {
        enCurso = null;
        pintarEstado();
        if (pendiente) { pendiente = false; programar(); }
      }
    })();
    return enCurso;
  }

  function programar() {
    clearTimeout(espera);
    estado = "pendiente";
    pintarEstado();
    espera = setTimeout(sincronizar, 1200);
  }

  /* ---------- Conectar ---------- */

  const aleatorio = (n) => btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(n))))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

  function claveNueva() {
    let k = localStorage.getItem("kilometraje.claveNueva");
    if (!k) { k = aleatorio(24); localStorage.setItem("kilometraje.claveNueva", k); }
    return k;
  }

  async function codigoScript() {
    const r = await fetch("google-script.gs", { cache: "no-cache" });
    return (await r.text()).replace("{{CLAVE}}", claveNueva());
  }

  async function conectar(url, clave) {
    url = url.trim();
    if (!/^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec$/.test(url)) {
      throw new Error("La dirección debe ser la de la «aplicación web» y acabar en /exec.");
    }
    let r;
    try {
      r = await llamar(url, clave, { accion: "leer" });
    } catch (e) {
      throw new Error(e.message === "clave"
        ? "La hoja responde, pero con otro código. Vuelve a copiar el código del paso 2 y crea una implementación nueva."
        : "No se ha podido conectar. Revisa que en «Quién tiene acceso» pusiste «Cualquier usuario».");
    }
    conf = { url, clave, version: r.version, hojaUrl: r.url };
    guardarConf();
    localStorage.removeItem("kilometraje.claveNueva");
    await sincronizar();
  }

  function enlaceOtroDispositivo() {
    const datosEnlace = btoa(JSON.stringify({ u: conf.url, k: conf.clave }));
    return location.origin + location.pathname + "#enlazar=" + encodeURIComponent(datosEnlace);
  }

  /** Al abrir un enlace de «otro dispositivo». */
  async function revisarEnlace() {
    const m = location.hash.match(/#enlazar=([^&]+)/);
    if (!m) return;
    history.replaceState(null, "", location.pathname);
    try {
      const { u, k } = JSON.parse(atob(decodeURIComponent(m[1])));
      if (conectada() && conf.url === u) return aviso("Este dispositivo ya está enlazado");
      await conectar(u, k);
      aviso("Enlazado con tu hoja de Google ✓");
    } catch (e) {
      aviso("No se ha podido enlazar: " + e.message);
    }
  }

  function desconectar() {
    conf = null;
    guardarConf();
    estado = "";
    pintarEstado();
  }

  /* ---------- Interfaz ---------- */

  const TEXTOS = {
    ok: ["Guardado", "Todo guardado en tu hoja de Google"],
    trabajando: ["Guardando", "Guardando en tu hoja…"],
    pendiente: ["Guardando", "Guardando en tu hoja…"],
    "sin-conexion": ["Sin conexión", "Sin conexión: se guardará en la hoja al volver la cobertura"],
    error: ["Reintentar", "No se ha podido guardar en la hoja. Se reintentará; también puedes pulsar «Guardar ahora»."],
    clave: ["Revisar", "La hoja ya no acepta este dispositivo. Desconecta y vuelve a configurar."],
    "": ["Guardado", ""],
  };

  function pintarEstado() {
    const pill = $("#nube");
    const tarjeta = $("#tarjeta-nube");
    tarjeta.dataset.modo = conectada() ? "conectada" : "sin-conectar";
    pill.hidden = !conectada();
    $("#recordatorio").hidden = conectada() || datos.viajes.length === 0;
    if (!conectada()) return;
    const [corto, largo] = TEXTOS[estado] || TEXTOS[""];
    pill.dataset.estado = estado === "ok" || !estado ? "ok" : ["trabajando", "pendiente"].includes(estado) ? "trabajando" : estado === "sin-conexion" ? "aviso" : "error";
    $("#nube-texto").textContent = corto;
    pill.title = largo;
    $("#nube-estado").textContent = (largo || "Conectada")
      + (conf.ultimaSync ? ` · última vez ${new Date(conf.ultimaSync).toLocaleString("es-ES", { dateStyle: "short", timeStyle: "short" })}` : "");
    const enlace = $("#nube-abrir");
    enlace.hidden = !conf.hojaUrl;
    if (conf.hojaUrl) enlace.href = conf.hojaUrl;
  }

  /* ---------- Asistente de configuración ---------- */

  function iniciarAsistente() {
    const dlg = $("#dlg-nube");
    let codigo = null;
    $("#btn-nube-configurar").addEventListener("click", () => {
      $("#nube-error").textContent = "";
      dlg.showModal();
      // Se prepara al abrir, para que «Copiar» funcione al instante (el móvil lo exige)
      codigoScript().then((t) => (codigo = t)).catch(() => {});
    });
    $("#recordatorio button").addEventListener("click", () => { irA("ajustes"); $("#btn-nube-configurar").click(); });
    $("#btn-copiar-codigo").addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(codigo || (await codigoScript()));
        aviso("Código copiado");
        $("#btn-copiar-codigo").textContent = "Copiado ✓";
      } catch (e) {
        aviso("No se ha podido copiar");
      }
    });
    $("#form-nube").addEventListener("submit", async (e) => {
      e.preventDefault();
      const boton = e.submitter;
      boton.disabled = true;
      boton.textContent = "Conectando…";
      $("#nube-error").textContent = "";
      try {
        await conectar(e.target.url.value, claveNueva());
        dlg.close();
        aviso("Conectado con tu hoja de Google ✓");
      } catch (err) {
        $("#nube-error").textContent = err.message;
      } finally {
        boton.disabled = false;
        boton.textContent = "Conectar";
      }
    });

    $("#btn-nube-sync").addEventListener("click", sincronizar);
    $("#nube").addEventListener("click", () => (estado === "clave" ? irA("ajustes") : sincronizar()));
    $("#btn-nube-enlace").addEventListener("click", async () => {
      const url = enlaceOtroDispositivo();
      try {
        if (navigator.share) await navigator.share({ title: "Enlazar Kilometraje", text: "Abre este enlace en el otro dispositivo para enlazarlo con tu hoja:", url });
        else { await navigator.clipboard.writeText(url); aviso("Enlace copiado. Ábrelo en el otro dispositivo."); }
      } catch (e) { /* cancelado */ }
    });
    $("#btn-nube-desconectar").addEventListener("click", () => {
      if (confirm("¿Desconectar la hoja en este dispositivo? Los datos siguen en la hoja y en el móvil.")) desconectar();
    });
  }

  async function iniciar() {
    alGuardar = programar;
    iniciarAsistente();
    pintarEstado();
    await revisarEnlace();
    addEventListener("hashchange", revisarEnlace); // enlace abierto con la app ya en marcha
    document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") sincronizar(); });
    addEventListener("online", sincronizar);
    sincronizar();
  }

  return { iniciar, sincronizar, combinar, aHojas, deHojas };
})();

Nube.iniciar();
