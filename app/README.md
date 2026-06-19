# Inventario - DM Sol Home

App web (HTML/CSS/JS, sin frameworks ni paso de build) conectada a Supabase.
Funciona igual en computadora y en celular: es una página web normal.

## Qué incluye esta versión

- Login con Google + control de acceso contra la tabla `emails_autorizados`.
- ABM completo de Proveedores (alta, edición, baja lógica).
- El resto de las secciones (Inventario, Stock, Órdenes de compra, Recepciones,
  Usuarios) están como "Próximamente" - se van agregando en los próximos pasos.

## Cómo probarla en tu computadora antes de subirla a internet

No podés simplemente abrir `index.html` haciendo doble clic, porque el navegador
bloquea los módulos de JavaScript cuando se abren como archivo local (file://).
Hace falta un mini servidor local. La forma más simple si tenés Python instalado:

```
cd app
python3 -m http.server 8000
```

Y después abrís `http://localhost:8000` en el navegador.

## Cómo publicarla gratis para usarla desde cualquier lado

La opción más simple es Netlify:

1. Entrá a https://app.netlify.com y creá una cuenta gratis.
2. En el dashboard buscá la opción de arrastrar y soltar una carpeta ("Deploy manually" / arrastrar carpeta).
3. Arrastrá la carpeta `app` completa (la que tiene el index.html adentro).
4. En unos segundos te da una URL pública (algo como `https://tu-app.netlify.app`).
5. Esa URL es la que abrís desde la compu y desde el celu - en el celu podés
   "agregar a inicio" desde el navegador para que se sienta como una app.

Importante: una vez que tengas esa URL final, hay que volver a Google Cloud
Console y agregarla en "Orígenes de JavaScript autorizados" del cliente OAuth
(además del redirect URI de Supabase que ya configuraste), para que el login
funcione también desde esa dirección y no solo en localhost.

## Estructura de archivos

```
app/
  index.html          pantallas de login, acceso denegado y shell principal
  css/styles.css       estilos
  js/supabaseClient.js conexión a Supabase (URL + publishable key)
  js/auth.js            login/logout con Google + verificación de allowlist
  js/proveedores.js     módulo ABM de Proveedores
  js/app.js             arranque de la app, sesión y navegación
```

Los próximos módulos (Inventario, Stock, Órdenes de compra, Recepciones,
Usuarios) se agregan como archivos nuevos en `js/`, siguiendo el mismo patrón
que `proveedores.js`.
