"use strict";

/* =========================================================
   Kilometraje — viajes pastorales
   Los datos se guardan en el móvil (localStorage) y, si se conecta,
   en una hoja de Google Sheets (nube.js).
   ========================================================= */

const CLAVE = "kilometraje.v1";
const TARIFA_INICIAL = 0.3;

/* ---------- Datos ---------- */

function datosVacios() {
  return {
    version: 1,
    ajustes: { nombre: "", correo: "", tarifa: TARIFA_INICIAL, mod: 0 },
    viajes: [],        // { id, fecha:"AAAA-MM-DD", destino, motivo, descripcion, km, liq: id|null }
    liquidaciones: [], // { id, fecha, viajes:[id], km, tarifa, importe, pagada: fecha|null }
    borrados: {},      // { id: momento } para sincronizar borrados entre dispositivos
  };
}

function cargar() {
  try {
    const d = JSON.parse(localStorage.getItem(CLAVE));
    if (d && Array.isArray(d.viajes)) return normalizar(d);
  } catch (e) { /* datos dañados o almacenamiento bloqueado */ }
  return datosVacios();
}

function normalizar(d) {
  return { ...datosVacios(), ...d, ajustes: { ...datosVacios().ajustes, ...d.ajustes }, borrados: { ...d.borrados } };
}

let datos = cargar();
const ahora = () => Date.now();

/** Guarda en la hoja de Google tras cada cambio (lo conecta nube.js). */
let alGuardar = () => {};

function guardar(opciones = {}) {
  try {
    localStorage.setItem(CLAVE, JSON.stringify(datos));
  } catch (e) {
    aviso("No se ha podido guardar. Revisa el espacio del móvil.");
  }
  pintar();
  if (opciones.sincronizar !== false) alGuardar();
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

const liqDe = (v) => (v.liq ? datos.liquidaciones.find((l) => l.id === v.liq) : null);
const estadoDe = (v) => { const l = liqDe(v); return !l ? "pendiente" : l.pagada ? "pagado" : "pedido"; };
const importeDe = (v) => redondear(v.km * (liqDe(v)?.tarifa ?? datos.ajustes.tarifa));
const sumaImporte = (lista) => redondear(lista.reduce((t, v) => t + importeDe(v), 0));
const sinTildes = (s) => String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

function htmlViaje(v, conEstado = false) {
  const d = aFecha(v.fecha);
  const dia = d.toLocaleDateString("es-ES", { weekday: "short" }).replace(".", "");
  const estado = estadoDe(v);
  const chip = conEstado && estado !== "pendiente" ? `<span class="chip ${estado}">${estado === "pagado" ? "Pagado" : "Pedido"}</span>` : "";
  return `
    <button class="viaje" data-id="${v.id}">
      <div class="dia"><b>${d.getDate()}</b><span>${esc(dia)}</span></div>
      <div class="info">
        <b>${esc(v.destino)}</b>
        <span>${esc(v.motivo) || (v.descripcion ? "" : "&nbsp;")}</span>
        ${v.descripcion ? `<span class="desc">${esc(v.descripcion)}</span>` : ""}
      </div>
      <div class="cifra"><b>${km(v.km)}</b><span>${euro(importeDe(v))}</span>${chip}</div>
    </button>`;
}

/* ---------- Filtros y orden de la lista ---------- */

const FILTRO_INICIAL = { estado: "pendiente", texto: "", periodo: "todo", desde: "", hasta: "", destino: "", motivo: "" };
const filtro = { ...FILTRO_INICIAL, orden: "reciente" };
try { filtro.orden = localStorage.getItem("kilometraje.orden") || "reciente"; } catch (e) {}

const ORDENES = {
  reciente: (a, b) => b.fecha.localeCompare(a.fecha) || (b.mod || 0) - (a.mod || 0),
  antiguo: (a, b) => a.fecha.localeCompare(b.fecha) || (a.mod || 0) - (b.mod || 0),
  "mas-km": (a, b) => b.km - a.km || b.fecha.localeCompare(a.fecha),
  "menos-km": (a, b) => a.km - b.km || b.fecha.localeCompare(a.fecha),
  destino: (a, b) => a.destino.localeCompare(b.destino, "es") || b.fecha.localeCompare(a.fecha),
};

function rangoPeriodo(periodo) {
  const d = new Date();
  const iso = (a, m, dia) => new Date(Date.UTC(a, m, dia)).toISOString().slice(0, 10);
  const [a, m] = [d.getFullYear(), d.getMonth()];
  switch (periodo) {
    case "este-mes": return [iso(a, m, 1), iso(a, m + 1, 0)];
    case "mes-pasado": return [iso(a, m - 1, 1), iso(a, m, 0)];
    case "este-anio": return [`${a}-01-01`, `${a}-12-31`];
    case "anio-pasado": return [`${a - 1}-01-01`, `${a - 1}-12-31`];
    case "fechas": return [filtro.desde || "0000-01-01", filtro.hasta || "9999-12-31"];
    default: return null;
  }
}

/** Filtros extra activos (los del botón «Filtros»): periodo, destino y motivo. */
const filtrosActivos = (f = filtro) => (f.periodo !== "todo" ? 1 : 0) + (f.destino ? 1 : 0) + (f.motivo ? 1 : 0);

function viajesFiltrados(f = filtro) {
  const rango = rangoPeriodo(f.periodo);
  const palabras = sinTildes(f.texto).split(/\s+/).filter(Boolean);
  return datos.viajes.filter((v) => {
    if (f.estado !== "todos" && estadoDe(v) !== f.estado) return false;
    if (rango && (v.fecha < rango[0] || v.fecha > rango[1])) return false;
    if (f.destino && v.destino !== f.destino) return false;
    if (f.motivo && v.motivo !== f.motivo) return false;
    if (palabras.length) {
      const texto = sinTildes(`${v.destino} ${v.motivo} ${v.descripcion}`);
      if (!palabras.every((p) => texto.includes(p))) return false;
    }
    return true;
  }).sort(ORDENES[f.orden] || ORDENES.reciente);
}

const TITULOS = { pendiente: "Viajes pendientes", pedido: "Viajes pedidos, sin cobrar", pagado: "Viajes pagados", todos: "Todos los viajes" };

function pintarLista() {
  const lista = viajesFiltrados();
  const conEstado = filtro.estado === "todos";
  $("#titulo-viajes").textContent = TITULOS[filtro.estado];
  document.querySelectorAll("#segmentos button").forEach((b) => b.setAttribute("aria-pressed", b.dataset.estado === filtro.estado));
  const n = filtrosActivos();
  $("#n-filtros").textContent = n;
  $("#n-filtros").hidden = !n;
  $("#btn-filtros").classList.toggle("activo", n > 0);

  const hayFiltros = n > 0 || filtro.texto.trim();
  $("#resumen-lista").innerHTML = lista.length
    ? `${lista.length} ${lista.length === 1 ? "viaje" : "viajes"} · ${km(sumaKm(lista))} · ${euro(sumaImporte(lista))}`
      + (hayFiltros ? ` · <button class="enlace" data-quitar-filtros>Quitar filtros</button>` : "")
    : "";

  let html;
  if (filtro.orden === "reciente" || filtro.orden === "antiguo") {
    const porMes = new Map();
    for (const v of lista) {
      const mes = aFecha(v.fecha).toLocaleDateString("es-ES", { month: "long", year: "numeric" });
      if (!porMes.has(mes)) porMes.set(mes, []);
      porMes.get(mes).push(v);
    }
    html = [...porMes].map(([mes, l]) =>
      `<p class="mes">${esc(mes)} · ${km(sumaKm(l))}</p><div class="grupo">${l.map((v) => htmlViaje(v, conEstado)).join("")}</div>`
    ).join("");
  } else {
    html = lista.length ? `<div class="grupo grupo-suelto">${lista.map((v) => htmlViaje(v, conEstado)).join("")}</div>` : "";
  }
  $("#lista-pendientes").innerHTML = html;

  const vacio = $("#vacio-pendientes");
  vacio.hidden = lista.length > 0;
  if (!lista.length) {
    vacio.innerHTML = !datos.viajes.length
      ? "Aún no hay viajes. Pulsa <b>+</b> para añadir el primero."
      : hayFiltros
        ? `Ningún viaje coincide con la búsqueda.<br><button class="btn btn-borde btn-peq" data-quitar-filtros>Quitar filtros</button>`
        : { pendiente: "No hay viajes pendientes de pedir.", pedido: "No hay viajes pedidos sin cobrar.", pagado: "Todavía no hay viajes pagados.", todos: "" }[filtro.estado];
  }
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

  pintarLista();

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
          ${viajes.map((v) => `<div class="liq-linea"><span>${fecha(v.fecha)} · ${esc(v.destino)}${v.motivo ? " — " + esc(v.motivo) : ""}${v.descripcion ? `<small>${esc(v.descripcion)}</small>` : ""}</span><span>${km(v.km)}</span></div>`).join("")}
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
  fViaje.descripcion.value = v?.descripcion ?? "";
  // Un viaje ya pedido no puede cambiar de fecha ni de kilómetros (cambiaría el importe pedido)
  const bloqueado = !!v?.liq;
  fViaje.fecha.disabled = fViaje.km.disabled = bloqueado;
  $("#viaje-bloqueado").hidden = !bloqueado;
  $("#btn-borrar-viaje").hidden = !v || bloqueado;
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
  const kmNum = editando?.liq ? editando.km : redondear(parseFloat(String(fViaje.km.value).replace(",", ".")));
  if (!(kmNum > 0)) { e.preventDefault(); return; }
  const campos = {
    fecha: editando?.liq ? editando.fecha : fViaje.fecha.value,
    destino: fViaje.destino.value.trim(),
    motivo: fViaje.motivo.value.trim(),
    descripcion: fViaje.descripcion.value.trim(),
    km: kmNum,
    mod: ahora(),
  };
  if (editando) Object.assign(editando, campos);
  else datos.viajes.push({ id: nuevoId(), liq: null, ...campos });
  guardar();
  aviso(editando ? "Viaje actualizado" : "Viaje guardado");
});

$("#btn-borrar-viaje").addEventListener("click", () => {
  if (!editando || !confirm(`¿Borrar el viaje a ${editando.destino}?`)) return;
  datos.viajes = datos.viajes.filter((v) => v !== editando);
  datos.borrados[editando.id] = ahora();
  dlgViaje.close();
  guardar();
  aviso("Viaje borrado");
});

$("#btn-nuevo").addEventListener("click", () => abrirViaje());
$("#lista-pendientes").addEventListener("click", (e) => {
  const b = e.target.closest(".viaje");
  if (b) abrirViaje(datos.viajes.find((v) => v.id === b.dataset.id));
});

/* ---------- Controles de filtro y orden ---------- */

const dlgFiltros = $("#dlg-filtros");
const fFiltros = $("#form-filtros");
let borrador = null; // filtros que se van eligiendo en el diálogo, antes de aplicarlos

$("#segmentos").addEventListener("click", (e) => {
  const b = e.target.closest("button[data-estado]");
  if (!b) return;
  filtro.estado = b.dataset.estado;
  pintarLista();
});

let esperaBusqueda;
$("#buscar").addEventListener("input", (e) => {
  clearTimeout(esperaBusqueda);
  esperaBusqueda = setTimeout(() => { filtro.texto = e.target.value; pintarLista(); }, 150);
});

function quitarFiltros() {
  Object.assign(filtro, { ...FILTRO_INICIAL, estado: filtro.estado });
  $("#buscar").value = "";
  pintarLista();
}
document.addEventListener("click", (e) => {
  if (e.target.closest("[data-quitar-filtros]")) quitarFiltros();
});

function opcionesUnicas(campo) {
  return [...new Set(datos.viajes.map((v) => v[campo]).filter(Boolean))].sort((a, b) => a.localeCompare(b, "es"));
}

function pintarDialogoFiltros() {
  const f = borrador;
  fFiltros.querySelectorAll("[data-orden]").forEach((b) => b.setAttribute("aria-pressed", b.dataset.orden === f.orden));
  fFiltros.querySelectorAll("[data-periodo]").forEach((b) => b.setAttribute("aria-pressed", b.dataset.periodo === f.periodo));
  $("#filtro-fechas").hidden = f.periodo !== "fechas";
  const n = viajesFiltrados(f).length;
  $("#btn-aplicar-filtros").textContent = n ? `Ver ${n} ${n === 1 ? "viaje" : "viajes"}` : "Ningún viaje";
}

$("#btn-filtros").addEventListener("click", () => {
  borrador = { ...filtro };
  const opciones = (campo, todos) => `<option value="">${todos}</option>`
    + opcionesUnicas(campo).map((o) => `<option${o === borrador[campo] ? " selected" : ""}>${esc(o)}</option>`).join("");
  fFiltros.destino.innerHTML = opciones("destino", "Todos los destinos");
  fFiltros.motivo.innerHTML = opciones("motivo", "Todos los motivos");
  fFiltros.desde.value = borrador.desde;
  fFiltros.hasta.value = borrador.hasta;
  pintarDialogoFiltros();
  dlgFiltros.showModal();
});

fFiltros.addEventListener("click", (e) => {
  const b = e.target.closest("[data-orden],[data-periodo]");
  if (!b) return;
  if (b.dataset.orden) borrador.orden = b.dataset.orden;
  if (b.dataset.periodo) borrador.periodo = b.dataset.periodo;
  pintarDialogoFiltros();
});
fFiltros.addEventListener("input", () => {
  Object.assign(borrador, { destino: fFiltros.destino.value, motivo: fFiltros.motivo.value, desde: fFiltros.desde.value, hasta: fFiltros.hasta.value });
  pintarDialogoFiltros();
});
$("#btn-limpiar-filtros").addEventListener("click", () => {
  Object.assign(borrador, { periodo: "todo", desde: "", hasta: "", destino: "", motivo: "" });
  fFiltros.destino.value = fFiltros.motivo.value = fFiltros.desde.value = fFiltros.hasta.value = "";
  pintarDialogoFiltros();
});
fFiltros.addEventListener("submit", (e) => {
  e.preventDefault();
  Object.assign(filtro, borrador);
  try { localStorage.setItem("kilometraje.orden", filtro.orden); } catch (err) {}
  dlgFiltros.close();
  pintarLista();
});

/* ---------- Pedir el pago ---------- */

const dlgPedir = $("#dlg-pedir");

function seleccionados() {
  const ids = [...dlgPedir.querySelectorAll("#pedir-lista input:checked")].map((i) => i.value);
  return datos.viajes.filter((v) => ids.includes(v.id)).sort((a, b) => a.fecha.localeCompare(b.fecha));
}

function textoCorreo(viajes, tarifa = datos.ajustes.tarifa) {
  const total = sumaKm(viajes);
  const lineas = viajes.map((v) => `• ${fecha(v.fecha)} · ${v.destino}${v.motivo ? " · " + v.motivo : ""} · ${km(v.km)}`
    + (v.descripcion ? `\n   ${v.descripcion.replace(/\s*\n\s*/g, " ")}` : ""));
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
    mod: ahora(),
  };
  sel.forEach((v) => { v.liq = liq.id; v.mod = liq.mod; });
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
      l.mod = ahora();
      aviso(`Marcado como pagado: ${euro(l.importe)}`);
      break;
    case "nopagada":
      l.pagada = null;
      l.mod = ahora();
      break;
    case "reenviar":
      abrirCorreo(viajes, l.tarifa);
      return;
    case "deshacer":
      if (!confirm("¿Anular esta petición? Los viajes vuelven a «pendientes».")) return;
      viajes.forEach((v) => { v.liq = null; v.mod = ahora(); });
      datos.liquidaciones = datos.liquidaciones.filter((x) => x !== l);
      datos.borrados[l.id] = ahora();
      aviso("Petición anulada");
      break;
  }
  guardar();
  // Mantener abierta la tarjeta que se estaba viendo
  document.querySelector(`.liq[data-id="${l.id}"]`)?.classList.add("abierta");
});

/* ---------- Ajustes ---------- */

let esperaAjustes;
function pintarResumenAjustes() {
  $("#saludo").textContent = datos.ajustes.nombre ? `Viajes pastorales de ${datos.ajustes.nombre}` : "Viajes pastorales";
}
$("#form-ajustes").addEventListener("input", (e) => {
  const f = e.currentTarget;
  const tarifa = parseFloat(String(f.tarifa.value).replace(",", "."));
  datos.ajustes.nombre = f.nombre.value.trim();
  datos.ajustes.correo = f.correo.value.trim();
  if (tarifa >= 0) datos.ajustes.tarifa = tarifa;
  datos.ajustes.mod = ahora();
  clearTimeout(esperaAjustes);
  esperaAjustes = setTimeout(guardar, 600); // espera a que termines de escribir
  pintarResumenAjustes();
  $("#estado-guardado").textContent = "Guardado ✓";
});
$("#form-ajustes").addEventListener("submit", (e) => e.preventDefault());

/* ---------- Compartir ficheros ---------- */

const TIPO_XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

function descargarFichero(fichero) {
  const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(fichero), download: fichero.name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

/** En Android abre el menú «Compartir»; en el ordenador, descarga. */
async function compartir(ficheros, titulo) {
  if (navigator.canShare?.({ files: ficheros })) {
    try {
      return await navigator.share({ files: ficheros, title: titulo });
    } catch (e) {
      if (e.name === "AbortError") return;
    }
  }
  ficheros.forEach(descargarFichero);
}

/* ---------- Excel ---------- */

function excelDeDatos() {
  const liqPorId = new Map(datos.liquidaciones.map((l) => [l.id, l]));
  const f = (iso) => (iso ? { v: Excel.serieFecha(iso), f: "fecha" } : null);
  const viajes = [...datos.viajes].sort((a, b) => a.fecha.localeCompare(b.fecha));
  const liqs = [...datos.liquidaciones].sort((a, b) => a.fecha.localeCompare(b.fecha));
  return Excel.crear([
    {
      nombre: "Viajes",
      anchos: [12, 24, 30, 40, 10, 12, 11, 12, 12],
      cabecera: ["Fecha", "Destino", "Motivo", "Descripción", "Km", "Importe", "Estado", "Pedido el", "Pagado el"],
      filas: viajes.map((v) => {
        const l = liqPorId.get(v.liq);
        const tarifa = l ? l.tarifa : datos.ajustes.tarifa;
        return [f(v.fecha), v.destino, v.motivo, v.descripcion || "", { v: v.km, f: "km" }, { v: redondear(v.km * tarifa), f: "euro" },
          l ? (l.pagada ? "Pagado" : "Pedido") : "Pendiente", f(l?.fecha), f(l?.pagada)];
      }),
    },
    {
      nombre: "Cobros",
      anchos: [12, 9, 10, 10, 12, 11, 12],
      cabecera: ["Pedido el", "Viajes", "Km", "€/km", "Importe", "Estado", "Pagado el"],
      filas: liqs.map((l) => [f(l.fecha), l.viajes.length, { v: l.km, f: "km" }, { v: l.tarifa, f: "euro" },
        { v: l.importe, f: "euro" }, l.pagada ? "Pagado" : "Pedido", f(l.pagada)]),
    },
  ]);
}

$("#btn-excel").addEventListener("click", () =>
  compartir([new File([excelDeDatos()], `Kilometraje-${hoy()}.xlsx`, { type: TIPO_XLSX })], "Kilometraje"));

/* ---------- Modo claro / oscuro ---------- */

const temaOscuroMovil = matchMedia("(prefers-color-scheme: dark)");
function aplicarTema() {
  const elegido = document.documentElement.dataset.tema; // "claro", "oscuro" o sin elegir (sigue al móvil)
  const efectivo = elegido || (temaOscuroMovil.matches ? "oscuro" : "claro");
  document.documentElement.dataset.temaEfectivo = efectivo;
  document.querySelector('meta[name="theme-color"]').content = efectivo === "oscuro" ? "#0d121b" : "#f3f6fb";
  $("#btn-tema").setAttribute("aria-label", efectivo === "oscuro" ? "Cambiar a modo claro" : "Cambiar a modo oscuro");
}
$("#btn-tema").addEventListener("click", () => {
  const nuevo = document.documentElement.dataset.temaEfectivo === "oscuro" ? "claro" : "oscuro";
  document.documentElement.dataset.tema = nuevo;
  try { localStorage.setItem("kilometraje.tema", nuevo); } catch (e) {}
  aplicarTema();
});
temaOscuroMovil.addEventListener("change", aplicarTema);
aplicarTema();

/* ---------- Arranque ---------- */

irA("viajes");
pintar();

// Pide al navegador que no borre los datos si falta espacio
navigator.storage?.persist?.();

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("sw.js").catch(() => {});
}
