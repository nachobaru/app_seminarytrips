"use strict";

/* =========================================================
   Sincronización con OneDrive (cuenta personal de Microsoft).

   - Inicio de sesión OAuth 2.0 con PKCE, sin librerías.
   - Permiso mínimo: solo la carpeta de la app en OneDrive
     (Aplicaciones/Kilometraje), nada más del OneDrive.
   - kilometraje.json  → los datos (lo que se sincroniza)
   - Kilometraje.xlsx  → hoja de cálculo para consultar en el ordenador
   ========================================================= */

const OneDrive = (() => {
  const AUTORIDAD = "https://login.microsoftonline.com/consumers/oauth2/v2.0";
  const PERMISOS = "Files.ReadWrite.AppFolder offline_access";
  const GRAPH = "https://graph.microsoft.com/v1.0/me/drive/special/approot";
  const CLAVE = "kilometraje.onedrive";
  const REDIRECCION = location.origin + location.pathname;

  let sesion = leerSesion(); // { access, caduca, refresh, etag, ultimaSync, excelUrl }
  let estado = "";           // texto para la interfaz
  let enCurso = null;
  let pendiente = false;
  let espera;

  function leerSesion() {
    try { return JSON.parse(localStorage.getItem(CLAVE)) || null; } catch (e) { return null; }
  }
  function guardarSesion() {
    try {
      if (sesion) localStorage.setItem(CLAVE, JSON.stringify(sesion));
      else localStorage.removeItem(CLAVE);
    } catch (e) { /* sin almacenamiento */ }
  }

  const configurado = () => !!CONFIG.clientId;
  const conectado = () => !!sesion?.refresh || !!sesion?.access;

  /* ---------- Inicio de sesión ---------- */

  const b64url = (bytes) => btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const aleatorio = (n) => b64url(crypto.getRandomValues(new Uint8Array(n)));

  async function conectar(silencioso = false) {
    const verificador = aleatorio(48);
    const estadoOAuth = aleatorio(16);
    sessionStorage.setItem("km.pkce", JSON.stringify({ verificador, estadoOAuth }));
    localStorage.setItem("km.pkce", JSON.stringify({ verificador, estadoOAuth })); // por si Android abre otra pestaña
    const reto = b64url(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verificador)));
    const p = new URLSearchParams({
      client_id: CONFIG.clientId,
      response_type: "code",
      redirect_uri: REDIRECCION,
      response_mode: "query",
      scope: PERMISOS,
      state: estadoOAuth,
      code_challenge: reto,
      code_challenge_method: "S256",
      ...(silencioso === true ? { prompt: "none" } : {}),
    });
    location.assign(`${AUTORIDAD}/authorize?${p}`);
  }

  /** Al volver de Microsoft con ?code=… en la dirección. */
  async function volverDeMicrosoft() {
    const q = new URLSearchParams(location.search);
    if (!q.has("code") && !q.has("error")) return false;
    history.replaceState(null, "", REDIRECCION);
    const guardado = JSON.parse(sessionStorage.getItem("km.pkce") || localStorage.getItem("km.pkce") || "null");
    sessionStorage.removeItem("km.pkce");
    localStorage.removeItem("km.pkce");
    if (q.has("error")) {
      if (["login_required", "interaction_required", "consent_required"].includes(q.get("error"))) return true; // reconexión silenciosa fallida
      aviso(q.get("error") === "access_denied" ? "Conexión cancelada" : "No se ha podido conectar con OneDrive");
      return true;
    }
    if (!guardado || guardado.estadoOAuth !== q.get("state")) {
      aviso("No se ha podido conectar. Inténtalo de nuevo.");
      return true;
    }
    try {
      await pedirToken({ grant_type: "authorization_code", code: q.get("code"), code_verifier: guardado.verificador, redirect_uri: REDIRECCION });
      if (!sessionStorage.getItem("km.silencioso")) aviso("Conectado con OneDrive");
    } catch (e) {
      aviso("No se ha podido conectar con OneDrive");
    }
    return true;
  }

  async function pedirToken(parametros) {
    const r = await fetch(`${AUTORIDAD}/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ client_id: CONFIG.clientId, scope: PERMISOS, ...parametros }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) {
      const e = new Error(j.error || "token");
      e.sesionCaducada = ["invalid_grant", "interaction_required", "login_required"].includes(j.error);
      throw e;
    }
    sesion = { ...sesion, access: j.access_token, caduca: Date.now() + (j.expires_in - 120) * 1000, refresh: j.refresh_token || sesion?.refresh };
    guardarSesion();
  }

  async function token() {
    if (sesion?.access && Date.now() < sesion.caduca) return sesion.access;
    if (!sesion?.refresh) throw Object.assign(new Error("sin sesión"), { sesionCaducada: true });
    await pedirToken({ grant_type: "refresh_token", refresh_token: sesion.refresh });
    return sesion.access;
  }

  function desconectar() {
    sesion = null;
    guardarSesion();
    estado = "";
    pintarEstado();
  }

  /* ---------- Llamadas a OneDrive ---------- */

  async function graph(ruta, opciones = {}) {
    const r = await fetch(GRAPH + ruta, {
      ...opciones,
      headers: { Authorization: "Bearer " + (await token()), ...opciones.headers },
    });
    if (r.status === 401) { // token rechazado: forzar renovación una vez
      sesion.access = null;
      return fetch(GRAPH + ruta, { ...opciones, headers: { Authorization: "Bearer " + (await token()), ...opciones.headers } });
    }
    return r;
  }

  async function descargar() {
    const r = await graph(":/kilometraje.json?select=id,eTag,@microsoft.graph.downloadUrl", { cache: "no-store" });
    if (r.status === 404) return null;
    if (!r.ok) throw new Error("descarga " + r.status);
    const meta = await r.json();
    const contenido = await fetch(meta["@microsoft.graph.downloadUrl"], { cache: "no-store" });
    if (!contenido.ok) throw new Error("contenido " + contenido.status);
    return { etag: meta.eTag, datos: await contenido.json() };
  }

  async function subir(nombre, cuerpo, tipo, etag) {
    return graph(`:/${nombre}:/content`, {
      method: "PUT",
      headers: { "Content-Type": tipo, ...(etag ? { "If-Match": etag } : {}) },
      body: cuerpo,
    });
  }

  /* ---------- Combinar datos de dos dispositivos ---------- */

  function combinar(a, b) {
    const borrados = { ...b.borrados };
    for (const [id, t] of Object.entries(a.borrados || {})) borrados[id] = Math.max(t, borrados[id] || 0);
    const unir = (x = [], y = []) => {
      const m = new Map();
      for (const r of [...y, ...x]) { // a gana en empate
        const prev = m.get(r.id);
        if (!prev || (r.mod || 0) >= (prev.mod || 0)) m.set(r.id, r);
      }
      return [...m.values()].filter((r) => !(borrados[r.id] >= (r.mod || 0)));
    };
    return normalizar({
      ...a,
      ajustes: (b.ajustes?.mod || 0) > (a.ajustes?.mod || 0) ? b.ajustes : a.ajustes,
      viajes: unir(a.viajes, b.viajes),
      liquidaciones: unir(a.liquidaciones, b.liquidaciones),
      borrados,
      ultimaCopia: [a.ultimaCopia, b.ultimaCopia].filter(Boolean).sort().pop() || null,
    });
  }

  const huella = (d) => JSON.stringify([d.ajustes, [...d.viajes].sort((x, y) => x.id.localeCompare(y.id)),
    [...d.liquidaciones].sort((x, y) => x.id.localeCompare(y.id)), d.borrados]);

  /* ---------- Sincronizar ---------- */

  async function sincronizar() {
    if (!configurado() || !conectado()) return;
    if (!navigator.onLine) { estado = "Sin conexión · se sincronizará luego"; pintarEstado(); return; }
    if (enCurso) { pendiente = true; return enCurso; }
    estado = "Sincronizando…";
    pintarEstado();
    enCurso = (async () => {
      try {
        for (let intento = 0; intento < 3; intento++) {
          const remoto = await descargar();
          const antes = huella(datos);
          const combinado = remoto ? combinar(datos, remoto.datos) : datos;
          if (huella(combinado) !== antes) { datos = combinado; guardar({ sincronizar: false }); }
          const subirDatos = !remoto || huella(combinado) !== huella(normalizar(remoto.datos));
          if (subirDatos) {
            const r = await subir("kilometraje.json", JSON.stringify(datos), "application/json", remoto?.etag);
            if (r.status === 412) continue; // otro dispositivo guardó a la vez: repetir
            if (!r.ok) throw new Error("subida " + r.status);
          }
          if (subirDatos || !sesion.excelUrl || sesion.excelPendiente) {
            const r = await subir("Kilometraje.xlsx", excelDeDatos(), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
            if (r.ok) { sesion.excelUrl = (await r.json()).webUrl; sesion.excelPendiente = false; }
            else sesion.excelPendiente = true; // p. ej. el Excel está abierto en el ordenador (423)
          }
          sesion.ultimaSync = Date.now();
          guardarSesion();
          estado = sesion.excelPendiente ? "Datos guardados · el Excel se actualizará luego" : "Sincronizado";
          return;
        }
        throw new Error("conflicto");
      } catch (e) {
        if (e.sesionCaducada) {
          sesion = { ...sesion, access: null, refresh: null };
          guardarSesion();
          estado = "Hay que volver a conectar";
        } else {
          estado = navigator.onLine ? "No se ha podido sincronizar" : "Sin conexión · se sincronizará luego";
        }
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
    espera = setTimeout(sincronizar, 1500);
  }

  /* ---------- Interfaz ---------- */

  function pintarEstado() {
    const pill = $("#nube");
    const tarjeta = $("#tarjeta-onedrive");
    if (!configurado()) { pill.hidden = true; tarjeta.hidden = true; return; }
    tarjeta.hidden = false;
    sincronizacionAutomatica = !!sesion;
    const conSesion = !!sesion?.refresh || (!!sesion?.access && Date.now() < sesion.caduca);
    tarjeta.dataset.modo = conSesion ? "conectado" : sesion ? "caducado" : "desconectado";
    pill.hidden = !sesion;
    const ok = estado === "Sincronizado";
    pill.dataset.estado = !conSesion ? "error" : ok ? "ok" : estado === "Sincronizando…" ? "trabajando" : "aviso";
    pill.title = estado;
    $("#nube-texto").textContent = !conSesion ? "Reconectar" : ok ? "OneDrive" : estado === "Sincronizando…" ? "Sincronizando" : "Pendiente";
    $("#od-estado").textContent = (conSesion ? estado || "Conectado" : "La sesión ha caducado. Vuelve a conectar (no se pierde nada).")
      + (sesion?.ultimaSync && conSesion ? ` · última vez ${new Date(sesion.ultimaSync).toLocaleString("es-ES", { dateStyle: "short", timeStyle: "short" })}` : "");
    const enlace = $("#od-excel");
    enlace.hidden = !sesion?.excelUrl;
    if (sesion?.excelUrl) enlace.href = sesion.excelUrl;
  }

  async function iniciar() {
    pintarEstado();
    if (!configurado()) return;
    const vuelta = await volverDeMicrosoft();
    // La sesión de una app web dura 24 h: al abrir, se renueva sola sin pedir contraseña
    // (una vez cada 10 minutos como mucho, para no entrar en bucle).
    const ultimoIntento = Number(sessionStorage.getItem("km.silencioso") || 0);
    if (!vuelta && sesion && !sesion.refresh && navigator.onLine && Date.now() - ultimoIntento > 600000) {
      sessionStorage.setItem("km.silencioso", Date.now());
      return conectar(true);
    }
    pintarEstado();
    alGuardar = programar;
    $("#btn-od-conectar").addEventListener("click", () => conectar());
    $("#btn-od-reconectar").addEventListener("click", () => conectar());
    $("#btn-od-sync").addEventListener("click", sincronizar);
    $("#btn-od-desconectar").addEventListener("click", () => {
      if (confirm("¿Desconectar OneDrive en este móvil? Los datos siguen aquí y en OneDrive.")) desconectar();
    });
    $("#nube").addEventListener("click", () => {
      if (!sesion?.refresh && !(sesion?.access && Date.now() < sesion.caduca)) conectar(false);
      else sincronizar();
    });
    document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") sincronizar(); });
    addEventListener("online", sincronizar);
    sincronizar();
  }

  return { iniciar, sincronizar, combinar };
})();

OneDrive.iniciar();
