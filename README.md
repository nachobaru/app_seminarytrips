# Kilometraje · viajes pastorales

Aplicación para el móvil (Android) que lleva la cuenta de los viajes pastorales y de lo que te debe el seminario por la gasolina: **kilómetros × 0,30 €**.

- **Viajes:** apunta cada viaje con fecha, destino, motivo y kilómetros (ida y vuelta). Si ya fuiste antes a ese destino, propone los mismos kilómetros.
- **Pedir el pago:** elige los viajes pendientes y la app escribe el correo a administración con la lista y el total. Al confirmar que lo has enviado, esos viajes pasan a **Cobros**.
- **Cobros:** cada petición aparece como «Pedido». Cuando te paguen, pulsa **Marcar como pagado** y queda registrado con la fecha.
- **Ajustes:** tu nombre (para la firma), el correo de administración y el precio por kilómetro.
- **OneDrive y Excel:** con un botón guardas en tu OneDrive un Excel con todos los viajes y cobros, y una copia de los datos.

Es una aplicación web instalable (PWA): no hace falta Play Store, ocupa muy poco y funciona sin conexión.

## Dónde se guardan los datos

**En el móvil**, siempre: la app funciona sin cobertura y no depende de ningún servidor.

**En tu OneDrive**, cuando pulsas **Guardar en OneDrive** (en Ajustes). Se abre el menú *Compartir* de Android: eliges **OneDrive** y una carpeta, siempre la misma, por ejemplo `Documentos/Kilometraje`. Se guardan dos ficheros:

| Fichero | Para qué |
|---|---|
| `Kilometraje.xlsx` | Hoja **Viajes** (fecha, destino, motivo, km, importe, estado, pedido el, pagado el) y hoja **Cobros**. Para consultar, filtrar o enviar desde el ordenador. |
| `Kilometraje-datos.json` | La copia de los datos. En un móvil nuevo: **Ajustes → Restaurar datos** y abrir este fichero desde OneDrive. |

Si OneDrive pregunta qué hacer porque ya existen, elige **Reemplazar**.

Para que no se te olvide, la app te ofrece guardar justo después de **pedir un pago** y de **marcar un cobro**. Además, en la pantalla de Viajes aparece un aviso si llevas más de dos semanas con cambios sin guardar.

## Instalar en el móvil

1. Abre la dirección de la app en **Chrome** en el móvil.
2. Toca el menú **⋮** → **Añadir a pantalla de inicio** (o **Instalar aplicación**).
3. Aparece el icono «Kilometraje» junto a tus otras aplicaciones y se abre a pantalla completa.

## Publicarla (una sola vez)

En GitHub, en este repositorio: **Settings → Pages → Build and deployment → Source: Deploy from a branch**, rama `main`, carpeta `/ (root)`. En uno o dos minutos la app queda en:

`https://nachobaru.github.io/app_seminarytrips/`

## Sincronización automática con OneDrive (opcional, desactivada)

La app incluye también una sincronización automática con OneDrive (`onedrive.js`), que ahora está desactivada. Para activarla hay que registrar la app en Microsoft Entra. Con una cuenta personal, eso exige crear antes una cuenta gratuita de Azure, que pide una tarjeta para verificar. Después se pone el *Id. de aplicación (cliente)* en `config.js` (registro con «Solo cuentas personales de Microsoft» y redirección SPA a la dirección de la app). Mientras `clientId` esté vacío, esa parte no aparece ni hace nada.

## Ficheros

| Fichero | Qué es |
|---|---|
| `index.html` | Las pantallas |
| `estilo.css` | El diseño (claro y oscuro según el móvil) |
| `app.js` | La lógica y el guardado de datos |
| `onedrive.js` | Sincronización automática con OneDrive (desactivada; ver arriba) |
| `excel.js` | Crea el fichero Excel (sin librerías externas) |
| `config.js` | Activa la sincronización automática si se rellena |
| `sw.js` | Permite usarla sin conexión. Si cambias algún fichero, sube el número de `VERSION` |
| `manifest.webmanifest`, `icono*` | Nombre e icono al instalarla |

Para probarla en el ordenador: `python3 -m http.server` en esta carpeta y abrir http://localhost:8000.
