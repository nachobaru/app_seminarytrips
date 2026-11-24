# Kilometraje · viajes pastorales

Aplicación para el móvil (Android) que lleva la cuenta de los viajes pastorales y de lo que te debe el seminario por la gasolina: **kilómetros × 0,30 €**.

- **Viajes:** apunta cada viaje con fecha, destino, motivo y kilómetros (ida y vuelta). Si ya fuiste antes a ese destino, propone los mismos kilómetros.
- **Pedir el pago:** elige los viajes pendientes y la app escribe el correo a administración con la lista y el total. Al confirmar que lo has enviado, esos viajes pasan a **Cobros**.
- **Cobros:** cada petición aparece como «Pedido». Cuando te paguen, pulsa **Marcar como pagado** y queda registrado con la fecha.
- **Ajustes:** tu nombre (para la firma), el correo de administración y el precio por kilómetro.
- **OneDrive y Excel:** los datos se guardan también en tu OneDrive y se mantiene al día un Excel con todos los viajes y cobros, para consultarlo desde el ordenador.

Es una aplicación web instalable (PWA): no hace falta Play Store, ocupa muy poco y funciona sin conexión.

## Dónde se guardan los datos

1. **En el móvil**, siempre. Así la app funciona sin cobertura.
2. **En tu OneDrive**, si lo conectas en **Ajustes → OneDrive**. Cada cambio se sube solo, y al abrir la app en otro móvil o en el ordenador se descargan los datos. Si cambias algo en dos dispositivos a la vez, se combina sin perder nada.

En OneDrive aparecen dos ficheros, en la carpeta **Aplicaciones › Kilometraje**:

| Fichero | Para qué |
|---|---|
| `kilometraje.json` | Los datos de la app. No lo toques. |
| `Kilometraje.xlsx` | Hoja **Viajes** (fecha, destino, motivo, km, importe, estado, pedido el, pagado el) y hoja **Cobros**. Se rehace sola con cada cambio: sirve para consultar, filtrar o enviar, pero lo que cambies en el Excel se sobrescribirá. Los cambios se hacen en la app. |

La app solo tiene permiso sobre esa carpeta: no puede ver el resto de tu OneDrive. No hay servidores intermedios: el móvil habla directamente con Microsoft.

Además, en **Ajustes** puedes **Descargar Excel** en cualquier momento, y **Guardar copia / Restaurar copia** como respaldo manual.

## Instalar en el móvil

1. Abre la dirección de la app en **Chrome** en el móvil.
2. Toca el menú **⋮** → **Añadir a pantalla de inicio** (o **Instalar aplicación**).
3. Aparece el icono «Kilometraje» junto a tus otras aplicaciones y se abre a pantalla completa.

## Publicarla (una sola vez)

En GitHub, en este repositorio: **Settings → Pages → Build and deployment → Source: Deploy from a branch**, rama `main`, carpeta `/ (root)`. En uno o dos minutos la app queda en:

`https://nachobaru.github.io/app_seminarytrips/`

## Conectar con OneDrive (una sola vez)

Para que la app pueda usar tu OneDrive, hay que darla de alta en Microsoft. Es gratis y se hace una sola vez, mejor desde el ordenador.

1. Entra en https://entra.microsoft.com con tu cuenta personal de Microsoft (la de OneDrive).
   - Si dice que no tienes directorio o inquilino (*tenant*), crea antes una cuenta gratuita de Azure en https://azure.microsoft.com/free con esa misma cuenta. Pide una tarjeta solo para verificar; esto no cobra nada.
2. Ve a **Aplicaciones → Registros de aplicaciones → Nuevo registro**:
   - **Nombre:** `Kilometraje`
   - **Tipos de cuenta admitidos:** *Solo cuentas personales de Microsoft*
   - **URI de redirección:** plataforma **Aplicación de página única (SPA)**, dirección `https://nachobaru.github.io/app_seminarytrips/` (con la barra final)
3. Pulsa **Registrar** y copia el **Id. de aplicación (cliente)**, un código del tipo `1a2b3c4d-…`.
4. Pégalo en `config.js`, en `clientId: "…"`. No es secreto: puede estar en el repositorio.

Después, en el móvil: **Ajustes → Conectar con OneDrive**. Inicia sesión y acepta el permiso «acceso a la carpeta de la aplicación».

Microsoft limita la sesión de las apps web a 24 horas. Al abrir la app, se renueva sola sin pedir contraseña mientras sigas con la sesión de Microsoft iniciada en el móvil. Si alguna vez no puede, arriba aparece **Reconectar**: un toque y listo. No se pierde nada, porque los datos siguen en el móvil.

## Ficheros

| Fichero | Qué es |
|---|---|
| `index.html` | Las pantallas |
| `estilo.css` | El diseño (claro y oscuro según el móvil) |
| `app.js` | La lógica y el guardado de datos |
| `onedrive.js` | Inicio de sesión con Microsoft y sincronización con OneDrive |
| `excel.js` | Crea el fichero Excel (sin librerías externas) |
| `config.js` | El identificador de la app en Microsoft |
| `sw.js` | Permite usarla sin conexión. Si cambias algún fichero, sube el número de `VERSION` |
| `manifest.webmanifest`, `icono*` | Nombre e icono al instalarla |

Para probarla en el ordenador: `python3 -m http.server` en esta carpeta y abrir http://localhost:8000.
