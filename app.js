"use strict";

/* =========================================================
   Kilometraje — viajes pastorales
   Todos los datos se guardan en el propio móvil (localStorage).
   ========================================================= */

const CLAVE = "kilometraje.v1";
const TARIFA_INICIAL = 0.3;

/* ---------- Datos ---------- */

function datosVacios() {
  return {
    version: 1,
    ajustes: { nombre: "", correo: "", tarifa: TARIFA_INICIAL },
    viajes: [],        // { id, fecha:"AAAA-MM-DD", destino, motivo, km, liq: id|null }
    liquidaciones: [], // { id, fecha, viajes:[id], km, tarifa, importe, pagada: fecha|null }
    ultimaCopia: null,
  };
}

function cargar() {
  try {
    const d = JSON.parse(localStorage.getItem(CLAVE));
    if (d && Array.isArray(d.viajes)) return { ...datosVacios(), ...d, ajustes: { ...datosVacios().ajustes, ...d.ajustes } };
  } catch (e) { /* datos dañados o almacenamiento bloqueado */ }
  return datosVacios();
}

let datos = cargar();

function guardar() {
  try {
    localStorage.setItem(CLAVE, JSON.stringify(datos));
  } catch (e) {
    aviso("No se ha podido guardar. Revisa el espacio del móvil.");
  }
  pintar();
}

const nuevoId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const hoy = () => {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
};

/* ---------- Formato ---------- */

const fmtEuro = new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" });
const fmtNum = new Intl.NumberFormat("es-ES", { maximumFractionDigits: 1 });
const euro = (n) => fmtEuro.format(n);
const km = (n) => fmtNum.format(n) + " km";
const redondear = (n) => Math.round(n * 100) / 100;
const fecha = (iso) => iso.split("-").reverse().join("/");
const aFecha = (iso) => new Date(iso + "T12:00:00");
const fechaLarga = (iso) => aFecha(iso).toLocaleDateString("es-ES", { day: "numeric", month: "long", year: "numeric" });
const tarifaTxt = (t) => t.toLocaleString("es-ES", { minimumFractionDigits: 2 }) + " €/km";

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

const $ = (s) => document.querySelector(s);
const pendientes = () => datos.viajes.filter((v) => !v.liq).sort((a, b) => b.fecha.localeCompare(a.fecha));
const sumaKm = (lista) => lista.reduce((t, v) => t + Number(v.km), 0);

/* ---------- Pintar ---------- */

function htmlViaje(v, etiqueta = "button") {
  const d = aFecha(v.fecha);
  const dia = d.toLocaleDateString("es-ES", { weekday: "short" }).replace(".", "");
  return `
    <${etiqueta} class="viaje" data-id="${v.id}">
      <div class="dia"><b>${d.getDate()}</b><span>${esc(dia)}</span></div>
      <div class="info"><b>${esc(v.destino)}</b><span>${esc(v.motivo) || "&nbsp;"}</span></div>
      <div class="cifra"><b>${km(v.km)}</b><span>${euro(redondear(v.km * datos.ajustes.tarifa))}</span></div>
    </${etiqueta}>`;
}

function pintar() {
  const t = datos.ajustes.tarifa;
  const pend = pendientes();
  const totalKm = sumaKm(pend);

  // Saludo
  $("#saludo").textContent = datos.ajustes.nombre ? `Viajes pastorales de ${datos.ajustes.nombre}` : "Viajes pastorales";

  // Resumen
  $("#res-importe").textContent = euro(redondear(totalKm * t));
  $("#res-detalle").textContent = pend.length
    ? `${pend.length} ${pend.length === 1 ? "viaje" : "viajes"} · ${km(totalKm)} × ${tarifaTxt(t)}`
    : "Sin viajes pendientes";
  $("#btn-pedir").disabled = !pend.length;

  // Lista de pendientes agrupada por mes
  const porMes = new Map();
  for (const v of pend) {
    const mes = aFecha(v.fecha).toLocaleDateString("es-ES", { month: "long", year: "numeric" });
    if (!porMes.has(mes)) porMes.set(mes, []);
    porMes.get(mes).push(v);
  }
  $("#lista-pendientes").innerHTML = [...porMes].map(([mes, lista]) =>
    `<p class="mes">${esc(mes)} · ${km(sumaKm(lista))}</p><div class="grupo">${lista.map((v) => htmlViaje(v)).join("")}</div>`
  ).join("");
  $("#vacio-pendientes").hidden = pend.length > 0;

  // Liquidaciones
  const liqs = [...datos.liquidaciones].sort((a, b) => b.fecha.localeCompare(a.fecha));
  const anio = String(new Date().getFullYear());
  $("#mini-solicitado").textContent = euro(liqs.filter((l) => !l.pagada).reduce((s, l) => s + l.importe, 0));
  $("#mini-cobrado").textContent = euro(liqs.filter((l) => l.pagada?.startsWith(anio)).reduce((s, l) => s + l.importe, 0));
  $("#vacio-liquidaciones").hidden = liqs.length > 0;
  $("#lista-liquidaciones").innerHTML = liqs.map((l) => {
    const viajes = l.viajes.map((id) => datos.viajes.find((v) => v.id === id)).filter(Boolean).sort((a, b) => a.fecha.localeCompare(b.fecha));
    return `
      <article class="liq" data-id="${l.id}">
        <div class="liq-cab" data-accion="abrir">
          <div class="info">
            <b>${euro(l.importe)}</b>
            <span>Pedido el ${fecha(l.fecha)} · ${viajes.length} ${viajes.length === 1 ? "viaje" : "viajes"} · ${km(l.km)}</span>
          </div>
          ${l.pagada
            ? `<span class="chip pagado">Pagado ${fecha(l.pagada)}</span>`
            : `<span class="chip pedido">Pedido</span>`}
        </div>
        <div class="liq-cuerpo">
          ${viajes.map((v) => `<div class="liq-linea"><span>${fecha(v.fecha)} · ${esc(v.destino)}${v.motivo ? " — " + esc(v.motivo) : ""}</span><span>${km(v.km)}</span></div>`).join("")}
          <p class="nota">${km(l.km)} × ${tarifaTxt(l.tarifa)} = ${euro(l.importe)}</p>
          <div class="fila-botones">
            ${l.pagada
              ? `<button class="btn btn-borde btn-peq" data-accion="nopagada">Marcar como no pagado</button>`
              : `<button class="btn btn-peq" data-accion="pagada">Marcar como pagado</button>
                 <button class="btn btn-borde btn-peq" data-accion="reenviar">Volver a enviar</button>`}
            <span class="hueco"></span>
            ${l.pagada ? "" : `<button class="btn btn-peligro btn-peq" data-accion="deshacer">Anular</button>`}
          </div>
        </div>
      </article>`;
  }).join("");

  // Sugerencias para destino y motivo
  const unicos = (campo) => [...new Set(datos.viajes.map((v) => v[campo]).filter(Boolean))].sort((a, b) => a.localeCompare(b, "es"));
  $("#destinos").innerHTML = unicos("destino").map((d) => `<option value="${esc(d)}">`).join("");
  $("#motivos").innerHTML = unicos("motivo").map((d) => `<option value="${esc(d)}">`).join("");

  // Ajustes
  const f = $("#form-ajustes");
  if (document.activeElement?.form !== f) {
    f.nombre.value = datos.ajustes.nombre;
    f.correo.value = datos.ajustes.correo;
    f.tarifa.value = datos.ajustes.tarifa;
  }
  $("#ultima-copia").textContent = datos.ultimaCopia ? `Última copia: ${fechaLarga(datos.ultimaCopia)}` : "Todavía no has hecho ninguna copia.";
}

/* ---------- Navegación ---------- */

function irA(vista) {
  document.body.dataset.vista = vista;
  document.querySelectorAll(".vista").forEach((s) => s.classList.toggle("activa", s.id === "vista-" + vista));
  document.querySelectorAll(".barra button").forEach((b) => b.classList.toggle("activa", b.dataset.vista === vista));
  window.scrollTo(0, 0);
}
document.querySelectorAll(".barra button").forEach((b) => b.addEventListener("click", () => irA(b.dataset.vista)));
document.querySelectorAll("[data-cerrar]").forEach((b) => b.addEventListener("click", () => b.closest("dialog").close()));
document.querySelectorAll("dialog").forEach((d) =>
  d.addEventListener("click", (e) => { if (e.target === d) d.close(); }) // tocar fuera cierra
);

/* ---------- Aviso flotante ---------- */

let temporizador;
function aviso(texto) {
  const t = $("#toast");
  t.textContent = texto;
  t.classList.add("ver");
  clearTimeout(temporizador);
  temporizador = setTimeout(() => t.classList.remove("ver"), 2600);
}

/* ---------- Alta y edición de viajes ---------- */

const dlgViaje = $("#dlg-viaje");
const fViaje = $("#form-viaje");
let editando = null;

function abrirViaje(v = null) {
  editando = v;
  $("#dlg-viaje-titulo").textContent = v ? "Editar viaje" : "Nuevo viaje";
  fViaje.fecha.value = v?.fecha ?? hoy();
  fViaje.destino.value = v?.destino ?? "";
  fViaje.motivo.value = v?.motivo ?? "";
  fViaje.km.value = v?.km ?? "";
  $("#btn-borrar-viaje").hidden = !v;
  actualizarImporteViaje();
  dlgViaje.showModal();
  if (!v) fViaje.destino.focus();
}

function actualizarImporteViaje() {
  const n = parseFloat(String(fViaje.km.value).replace(",", "."));
  $("#viaje-importe").textContent = n > 0 ? `${km(n)} × ${tarifaTxt(datos.ajustes.tarifa)} = ${euro(redondear(n * datos.ajustes.tarifa))}` : "";
}
fViaje.km.addEventListener("input", actualizarImporteViaje);

// Si ya fuiste a ese destino, propone los mismos kilómetros
fViaje.destino.addEventListener("change", () => {
  if (fViaje.km.value) return;
  const nombre = fViaje.destino.value.trim().toLowerCase();
  const anterior = [...datos.viajes].sort((a, b) => b.fecha.localeCompare(a.fecha)).find((v) => v.destino.toLowerCase() === nombre);
  if (anterior) { fViaje.km.value = anterior.km; actualizarImporteViaje(); }
});

fViaje.addEventListener("submit", (e) => {
  if (e.submitter?.value !== "ok") return;
  const kmNum = redondear(parseFloat(String(fViaje.km.value).replace(",", ".")));
  if (!(kmNum > 0)) { e.preventDefault(); return; }
  const campos = {
    fecha: fViaje.fecha.value,
    destino: fViaje.destino.value.trim(),
    motivo: fViaje.motivo.value.trim(),
    km: kmNum,
  };
  if (editando) Object.assign(editando, campos);
  else datos.viajes.push({ id: nuevoId(), liq: null, ...campos });
  guardar();
  aviso(editando ? "Viaje actualizado" : "Viaje guardado");
});

$("#btn-borrar-viaje").addEventListener("click", () => {
  if (!editando || !confirm(`¿Borrar el viaje a ${editando.destino}?`)) return;
  datos.viajes = datos.viajes.filter((v) => v !== editando);
  dlgViaje.close();
  guardar();
  aviso("Viaje borrado");
});

$("#btn-nuevo").addEventListener("click", () => abrirViaje());
$("#lista-pendientes").addEventListener("click", (e) => {
  const b = e.target.closest(".viaje");
  if (b) abrirViaje(datos.viajes.find((v) => v.id === b.dataset.id));
});

/* ---------- Pedir el pago ---------- */

const dlgPedir = $("#dlg-pedir");

function seleccionados() {
  const ids = [...dlgPedir.querySelectorAll("#pedir-lista input:checked")].map((i) => i.value);
  return datos.viajes.filter((v) => ids.includes(v.id)).sort((a, b) => a.fecha.localeCompare(b.fecha));
}

function textoCorreo(viajes, tarifa = datos.ajustes.tarifa) {
  const total = sumaKm(viajes);
  const lineas = viajes.map((v) => `• ${fecha(v.fecha)} · ${v.destino}${v.motivo ? " · " + v.motivo : ""} · ${km(v.km)}`);
  const nombre = datos.ajustes.nombre;
  return {
    asunto: `Kilometraje de viajes pastorales${nombre ? " — " + nombre : ""} (${fecha(hoy())})`,
    cuerpo: [
      "Buenos días:",
      "",
      "Os envío la relación de viajes pastorales pendientes de abonar:",
      "",
      ...lineas,
      "",
      `Total: ${km(total)} × ${tarifaTxt(tarifa)} = ${euro(redondear(total * tarifa))}`,
      "",
      "Muchas gracias. Un saludo,",
      nombre,
    ].join("\n").trim(),
  };
}

function actualizarTotalPedir() {
  const sel = seleccionados();
  const total = sumaKm(sel);
  $("#pedir-total").innerHTML = `${sel.length} ${sel.length === 1 ? "viaje" : "viajes"} · ${km(total)}<br><b>${euro(redondear(total * datos.ajustes.tarifa))}</b>`;
  $("#btn-abrir-correo").disabled = $("#btn-copiar").disabled = !sel.length;
}

$("#btn-pedir").addEventListener("click", () => {
  const pend = [...pendientes()].reverse();
  $("#pedir-lista").innerHTML = pend.map((v) => `
    <label><input type="checkbox" value="${v.id}" checked>
      <div class="info"><b>${esc(v.destino)}</b><span>${fecha(v.fecha)}${v.motivo ? " · " + esc(v.motivo) : ""}</span></div>
      <span>${km(v.km)}</span>
    </label>`).join("");
  $("#pedir-sin-correo").hidden = !!datos.ajustes.correo;
  $("#pedir-paso1").hidden = false;
  $("#pedir-paso2").hidden = true;
  actualizarTotalPedir();
  dlgPedir.showModal();
});
$("#pedir-lista").addEventListener("change", actualizarTotalPedir);

function abrirCorreo(viajes, tarifa) {
  const { asunto, cuerpo } = textoCorreo(viajes, tarifa);
  location.href = `mailto:${encodeURIComponent(datos.ajustes.correo)}?subject=${encodeURIComponent(asunto)}&body=${encodeURIComponent(cuerpo)}`;
}

$("#btn-abrir-correo").addEventListener("click", () => {
  abrirCorreo(seleccionados());
  $("#pedir-paso1").hidden = true;
  $("#pedir-paso2").hidden = false;
});

$("#btn-copiar").addEventListener("click", async () => {
  const { asunto, cuerpo } = textoCorreo(seleccionados());
  try {
    await navigator.clipboard.writeText(`${asunto}\n\n${cuerpo}`);
    aviso("Texto copiado");
    $("#pedir-paso1").hidden = true;
    $("#pedir-paso2").hidden = false;
  } catch (e) {
    aviso("No se ha podido copiar");
  }
});

$("#btn-no-enviado").addEventListener("click", () => {
  $("#pedir-paso1").hidden = false;
  $("#pedir-paso2").hidden = true;
});

$("#btn-si-enviado").addEventListener("click", () => {
  const sel = seleccionados();
  if (!sel.length) return;
  const total = redondear(sumaKm(sel));
  const liq = {
    id: nuevoId(),
    fecha: hoy(),
    viajes: sel.map((v) => v.id),
    km: total,
    tarifa: datos.ajustes.tarifa,
    importe: redondear(total * datos.ajustes.tarifa),
    pagada: null,
  };
  sel.forEach((v) => (v.liq = liq.id));
  datos.liquidaciones.push(liq);
  dlgPedir.close();
  guardar();
  irA("cobros");
  aviso("Petición guardada en Cobros");
});

/* ---------- Cobros ---------- */

$("#lista-liquidaciones").addEventListener("click", (e) => {
  const el = e.target.closest("[data-accion]");
  if (!el) return;
  const art = el.closest(".liq");
  const l = datos.liquidaciones.find((x) => x.id === art.dataset.id);
  const viajes = datos.viajes.filter((v) => v.liq === l.id).sort((a, b) => a.fecha.localeCompare(b.fecha));

  switch (el.dataset.accion) {
    case "abrir":
      art.classList.toggle("abierta");
      return;
    case "pagada":
      l.pagada = hoy();
      aviso(`Marcado como pagado: ${euro(l.importe)}`);
      break;
    case "nopagada":
      l.pagada = null;
      break;
    case "reenviar":
      abrirCorreo(viajes, l.tarifa);
      return;
    case "deshacer":
      if (!confirm("¿Anular esta petición? Los viajes vuelven a «pendientes».")) return;
      viajes.forEach((v) => (v.liq = null));
      datos.liquidaciones = datos.liquidaciones.filter((x) => x !== l);
      aviso("Petición anulada");
      break;
  }
  guardar();
  // Mantener abierta la tarjeta que se estaba viendo
  document.querySelector(`.liq[data-id="${l.id}"]`)?.classList.add("abierta");
});

/* ---------- Ajustes ---------- */

$("#form-ajustes").addEventListener("input", (e) => {
  const f = e.currentTarget;
  const tarifa = parseFloat(String(f.tarifa.value).replace(",", "."));
  datos.ajustes.nombre = f.nombre.value.trim();
  datos.ajustes.correo = f.correo.value.trim();
  if (tarifa >= 0) datos.ajustes.tarifa = tarifa;
  guardar();
  $("#estado-guardado").textContent = "Guardado ✓";
});
$("#form-ajustes").addEventListener("submit", (e) => e.preventDefault());

/* ---------- Copia de seguridad ---------- */

$("#btn-exportar").addEventListener("click", async () => {
  datos.ultimaCopia = hoy();
  const nombre = `kilometraje-${hoy()}.json`;
  const fichero = new File([JSON.stringify(datos, null, 2)], nombre, { type: "application/json" });
  try {
    // En Android abre el menú «Compartir» (Drive, Gmail, WhatsApp…)
    if (navigator.canShare?.({ files: [fichero] })) {
      await navigator.share({ files: [fichero], title: "Copia de Kilometraje" });
    } else {
      const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(fichero), download: nombre });
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    }
    guardar();
    aviso("Copia creada");
  } catch (e) {
    datos = cargar(); // compartir cancelado: no anotar la copia
  }
});

$("#btn-importar").addEventListener("click", () => $("#fichero-importar").click());
$("#fichero-importar").addEventListener("change", async (e) => {
  const f = e.target.files[0];
  e.target.value = "";
  if (!f) return;
  try {
    const d = JSON.parse(await f.text());
    if (!Array.isArray(d.viajes) || !Array.isArray(d.liquidaciones)) throw new Error();
    if (!confirm(`La copia tiene ${d.viajes.length} viajes. Sustituirá a los datos actuales. ¿Seguir?`)) return;
    datos = { ...datosVacios(), ...d, ajustes: { ...datosVacios().ajustes, ...d.ajustes } };
    guardar();
    aviso("Copia restaurada");
  } catch (err) {
    aviso("Ese fichero no es una copia válida");
  }
});

/* ---------- Arranque ---------- */

irA("viajes");
pintar();

// Pide al navegador que no borre los datos si falta espacio
navigator.storage?.persist?.();

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("sw.js").catch(() => {});
}
