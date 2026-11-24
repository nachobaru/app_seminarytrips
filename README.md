# Kilometraje · viajes pastorales

Aplicación para el móvil (Android) que lleva la cuenta de los viajes pastorales y de lo que te debe el seminario por la gasolina: **kilómetros × 0,30 €**.

- **Viajes:** apunta cada viaje con fecha, destino, motivo y kilómetros (ida y vuelta). Si ya fuiste antes a ese destino, propone los mismos kilómetros.
- **Pedir el pago:** elige los viajes pendientes y la app escribe el correo a administración con la lista y el total. Al confirmar que lo has enviado, esos viajes pasan a **Cobros**.
- **Cobros:** cada petición aparece como «Pedido». Cuando te paguen, pulsa **Marcar como pagado** y queda registrado con la fecha.
- **Ajustes:** tu nombre (para la firma), el correo de administración y el precio por kilómetro.

Es una aplicación web instalable (PWA): no hace falta Play Store, ocupa muy poco y funciona sin conexión.

## Dónde se guardan los datos

En el **propio móvil**, en el almacenamiento del navegador. No hay cuentas, servidores ni nadie más que los vea.

Como solo están en el móvil, si se borran los datos de Chrome o cambias de teléfono se perderían. Por eso en **Ajustes → Guardar copia** se crea un fichero con todo, que puedes guardar en Google Drive o enviarte por correo. Con **Restaurar copia** se recupera en el mismo móvil o en uno nuevo.

Consejo: haz una copia cada vez que marques un cobro.

## Instalar en el móvil

1. Abre la dirección de la app en **Chrome** en el móvil.
2. Toca el menú **⋮** → **Añadir a pantalla de inicio** (o **Instalar aplicación**).
3. Aparece el icono «Kilometraje» junto a tus otras aplicaciones y se abre a pantalla completa.

## Publicarla (una sola vez)

En GitHub, en este repositorio: **Settings → Pages → Build and deployment → Source: Deploy from a branch**, rama `main`, carpeta `/ (root)`. En uno o dos minutos la app queda en:

`https://nachobaru.github.io/app_seminarytrips/`

## Ficheros

| Fichero | Qué es |
|---|---|
| `index.html` | Las pantallas |
| `estilo.css` | El diseño (claro y oscuro según el móvil) |
| `app.js` | La lógica y el guardado de datos |
| `sw.js` | Permite usarla sin conexión. Si cambias algún fichero, sube el número de `VERSION` |
| `manifest.webmanifest`, `icono*` | Nombre e icono al instalarla |

Para probarla en el ordenador: `python3 -m http.server` en esta carpeta y abrir http://localhost:8000.
