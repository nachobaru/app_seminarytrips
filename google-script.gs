/**
 * Semi Trips · enlace con esta hoja de cálculo.
 *
 * Pega este código en Extensiones → Apps Script de tu hoja y publícalo como
 * «Aplicación web» (ver la app: Ajustes → Hoja de Google → Configurar).
 * La app guarda aquí los viajes y los cobros. Puedes consultar, filtrar o
 * descargar la hoja, pero haz los cambios en la app: la hoja se reescribe.
 */

const CLAVE = "{{CLAVE}}"; // la pone la app; no la compartas

function doPost(e) {
  let p;
  try { p = JSON.parse(e.postData.contents); } catch (err) { return responder({ error: "peticion" }); }
  if (!p || p.clave !== CLAVE) return responder({ error: "clave" });

  const cerrojo = LockService.getScriptLock();
  cerrojo.waitLock(25000);
  try {
    const props = PropertiesService.getScriptProperties();
    const version = Number(props.getProperty("version") || 0);

    if (p.accion === "leer") return responder(leer(version, props));

    if (p.accion === "escribir") {
      if (p.base !== version) return responder({ conflicto: true, ...leer(version, props) });
      for (const nombre of Object.keys(p.hojas)) escribirHoja(nombre, p.hojas[nombre]);
      props.setProperty("extra", JSON.stringify(p.extra || {}));
      props.setProperty("version", String(version + 1));
      return responder({ ok: true, version: version + 1 });
    }
    return responder({ error: "accion" });
  } finally {
    cerrojo.releaseLock();
  }
}

function doGet() {
  return ContentService.createTextOutput("Semi Trips: el enlace con la hoja funciona. Vuelve a la app.");
}

function leer(version, props) {
  const libro = SpreadsheetApp.getActive();
  const zona = libro.getSpreadsheetTimeZone();
  const hojas = {};
  for (const hoja of libro.getSheets()) {
    const valores = hoja.getDataRange().getValues();
    hojas[hoja.getName()] = valores.slice(1).filter((f) => f.some((v) => v !== "")).map((f) =>
      f.map((v) => (v instanceof Date ? Utilities.formatDate(v, zona, "yyyy-MM-dd") : v))
    );
  }
  return { version, hojas, extra: JSON.parse(props.getProperty("extra") || "{}"), url: libro.getUrl() };
}

/** hoja: { cabecera:[], filas:[[]], formatos:[], anchos:[], ocultas:[índices], fechas:[índices] } */
function escribirHoja(nombre, h) {
  const libro = SpreadsheetApp.getActive();
  let hoja = libro.getSheetByName(nombre);
  if (!hoja) {
    const vacia = libro.getSheets().find((s) => s.getLastRow() === 0 && /^(Hoja|Sheet)\s?1$/.test(s.getName()));
    hoja = vacia ? vacia.setName(nombre) : libro.insertSheet(nombre);
  }
  const columnas = h.cabecera.length;
  const filas = h.filas.map((f) => f.map((v, i) => (h.fechas.includes(i) && v ? aFecha(v) : v)));

  if (hoja.getMaxColumns() < columnas) hoja.insertColumnsAfter(hoja.getMaxColumns(), columnas - hoja.getMaxColumns());
  if (hoja.getMaxRows() < filas.length + 1) hoja.insertRowsAfter(hoja.getMaxRows(), filas.length + 1 - hoja.getMaxRows());
  hoja.getRange(2, 1, hoja.getMaxRows() - 1, hoja.getMaxColumns()).clearContent();

  hoja.getRange(1, 1, 1, columnas).setValues([h.cabecera])
    .setFontWeight("bold").setFontColor("#ffffff").setBackground("#1f62d1");
  hoja.setFrozenRows(1);
  h.formatos.forEach((f, i) => hoja.getRange(2, i + 1, hoja.getMaxRows() - 1, 1).setNumberFormat(f));
  if (filas.length) hoja.getRange(2, 1, filas.length, columnas).setValues(filas);
  h.anchos.forEach((w, i) => hoja.setColumnWidth(i + 1, w));
  h.ocultas.forEach((i) => hoja.hideColumns(i + 1));

  if (!hoja.getFilter()) hoja.getRange(1, 1, hoja.getMaxRows(), columnas).createFilter();
  if (!hoja.getProtections(SpreadsheetApp.ProtectionType.SHEET).length) {
    hoja.protect().setDescription("Los cambios se hacen en la app Semi Trips").setWarningOnly(true);
  }
}

function aFecha(iso) {
  const [a, m, d] = String(iso).split("-").map(Number);
  return new Date(a, m - 1, d, 12); // a mediodía, para que ninguna zona horaria cambie el día
}

function responder(objeto) {
  return ContentService.createTextOutput(JSON.stringify(objeto)).setMimeType(ContentService.MimeType.JSON);
}
