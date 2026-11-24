# Kilometraje · viajes pastorales

Aplicación para el móvil (Android) que lleva la cuenta de los viajes pastorales y de lo que te debe el seminario por la gasolina: **kilómetros × 0,30 €**.

- **Viajes:** apunta cada viaje con fecha, destino, motivo, kilómetros (ida y vuelta) y, si quieres, una descripción. Si ya fuiste antes a ese destino, propone los mismos kilómetros.
- **Buscar, filtrar y ordenar:** ver los viajes pendientes, pedidos, pagados o todos; buscar por destino, motivo o descripción; filtrar por fechas, destino o motivo; y ordenar por fecha, kilómetros o destino. Debajo se ven el total de viajes, km y euros de lo filtrado.
- **Pedir el pago:** elige los viajes pendientes y la app escribe el correo a administración («Solicito a la administración del Seminario Metropolitano de Oviedo el pago de los gastos de gasolina…») con la lista de viajes, el total y los datos para la transferencia. Al confirmar que lo has enviado, esos viajes pasan a **Cobros**.
- **Cobros:** cada petición aparece como «Pedido». Cuando te paguen, pulsa **Marcar como pagado** y queda registrado con la fecha.
- **Hoja de Google:** todo se guarda solo en una hoja de cálculo de tu Google Drive.
- **Ajustes:** tu nombre (para la firma), el correo de administración, el precio por kilómetro y los datos para el cobro (titular de la cuenta e IBAN). El IBAN se comprueba al escribirlo, por si te equivocas en algún número. Modo claro u oscuro con el botón de arriba.

Es una aplicación web instalable (PWA): no hace falta Play Store, ocupa muy poco y funciona sin conexión.

## Dónde se guardan los datos

1. **En el móvil**, siempre. Por eso funciona sin cobertura.
2. **En una hoja de Google Sheets tuya**, en cuanto la conectas (**Ajustes → Hoja de Google → Configurar**). Cada cambio se guarda solo en unos segundos. Si no hay cobertura, se guarda al volver.

La hoja tiene dos pestañas:

| Pestaña | Columnas |
|---|---|
| **Viajes** | Fecha, Destino, Motivo, Km, Importe, Estado (Pendiente, Pedido o Pagado), Pedido el, Pagado el, Descripción |
| **Cobros** | Pedido el, Nº de viajes, Km, €/km, Importe, Estado, Pagado el |

Hay además unas columnas ocultas que la app necesita: no las borres. Puedes consultar, filtrar o descargar la hoja como Excel (**Archivo → Descargar**). Los cambios, en cambio, hazlos en la app: la hoja se reescribe con cada cambio, y Google avisa si intentas editarla.

**Varios dispositivos:** en **Ajustes → Usar en otro dispositivo** se comparte un enlace. Al abrirlo en otro móvil o en el ordenador, queda conectado a la misma hoja. Si cambias algo en dos sitios a la vez, se combina sin perder nada.

**Cambio de móvil:** instala la app en el nuevo y abre ese enlace. Si en el asistente ves «Esta hoja ya está configurada con la clave de otro dispositivo», no repitas los pasos: usa el enlace, o pega la clave que aparece en la línea `const CLAVE = "…"` del script (Extensiones → Apps Script). Si ya no tienes el móvil viejo, repite la configuración en la misma hoja: Extensiones → Apps Script, pega el código nuevo y crea una **implementación nueva**.

### Cómo funciona por dentro

En la hoja va un pequeño script (`google-script.gs`) publicado como «aplicación web». La app le envía los datos y él los escribe en la hoja. Solo acepta peticiones que llevan la clave secreta que la app generó al configurarlo. Esa clave va dentro del enlace «Usar en otro dispositivo», así que no compartas ese enlace con nadie.

El script solo lee y escribe filas: toda la lógica está en la app. Así, las mejoras de la app no obligan a volver a pegar el script. La app guarda en la hoja la lista de sus columnas y lee cada dato por su nombre. Las columnas nuevas se añaden siempre al final, porque el script oculta las columnas internas por posición.

## Instalar en el móvil

1. Abre https://nachobaru.github.io/app_seminarytrips/ en **Chrome**.
2. Menú **⋮** → **Añadir a pantalla de inicio** (o **Instalar aplicación**).

## Publicación

GitHub Pages publica la rama `main` (**Settings → Pages → Deploy from a branch → `main` / root**).

## Ficheros

| Fichero | Qué es |
|---|---|
| `index.html` | Las pantallas |
| `estilo.css` | El diseño (claro y oscuro) |
| `app.js` | Viajes, cobros, correo y datos en el móvil |
| `nube.js` | Guardado en la hoja de Google y enlace con otros dispositivos |
| `google-script.gs` | El script que se pega en la hoja (la app pone la clave al copiarlo) |
| `excel.js` | Crea el fichero Excel de **Ajustes → Descargar Excel** |
| `sw.js` | Permite usarla sin conexión. Si cambias algún fichero, sube el número de `VERSION` |
| `manifest.webmanifest`, `icono*` | Nombre e icono al instalarla |

Para probarla en el ordenador: `python3 -m http.server` en esta carpeta y abrir http://localhost:8000.
