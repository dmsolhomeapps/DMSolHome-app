# DM Sol Home Apps

App web (HTML/CSS/JS plano, sin frameworks ni paso de build) conectada a
Supabase. Es una página web normal: funciona igual en computadora y en
celular, sin instalar nada del lado del usuario.

## Dónde está publicada

URL real: https://dmsolhomeapps.github.io/DMSolHome-app/

Se publica con GitHub Pages (gratis, sin límite de despliegues). El
repositorio es público porque ahí solo vive código y dos datos no sensibles
(la URL del proyecto de Supabase y la Publishable key, pensada justamente
para usarse del lado del cliente). Los datos reales del negocio están
protegidos por las políticas de seguridad de la base, no por mantener el
código oculto.

## Qué incluye esta versión

- Login con Google, restringido a la lista de `emails_autorizados` en la base
  (aunque alguien tenga cuenta de Gmail, si no está en esa tabla no entra).
- Cada fila de cada tabla registra automáticamente quién la creó/modificó y
  cuándo (`creado_por`, `creado_en`, `actualizado_por`, `actualizado_en`).
- ABM completo de Proveedores (alta, edición, baja lógica).
- Identidad visual con el logo y los colores de DM Sol Home.
- El resto de las secciones (Inventario, Stock, Órdenes de compra,
  Recepciones, Usuarios) están como "Próximamente" en el menú - se van
  agregando de a uno.

## Cómo se actualiza

No hace falta git ni terminal. En el repositorio de GitHub: "Add file" →
"Upload files", arrastrás los archivos que cambiaron (se sobrescriben solos)
y "Commit changes". GitHub Pages tarda menos de un minuto en mostrar la
versión nueva. Si el navegador sigue mostrando la versión vieja, conviene
refrescar forzado (Ctrl+Shift+R o Cmd+Shift+R).

## Configuración externa de la que depende esta app

Esto no está en el código, vive en las consolas de Google y Supabase:

- **Supabase → Authentication → URL Configuration**: el Site URL y los
  Redirect URLs tienen que incluir la URL real de GitHub Pages de arriba
  (con `/**` al final en Redirect URLs).
- **Supabase → Authentication → Sign In/Up → Auth Providers → Google**:
  ahí están pegados el Client ID y Client Secret que genera Google Cloud
  Console.
- **Google Cloud Console → Google Auth Platform**: tiene tres partes -
  Audiencia (lista de usuarios de prueba), Acceso a datos (permisos básicos:
  email, profile, openid) y Clients (el cliente OAuth con el redirect URI
  apuntando al callback de Supabase).
- **Tabla `emails_autorizados`** (en el SQL Editor de Supabase): quién puede
  entrar de verdad a la app. Se carga/edita con un `insert` o `update` directo
  ahí, no desde la app.

Si en algún momento el login deja de funcionar, lo más probable es que sea
algún desajuste entre estas piezas (una URL que no coincide exactamente,
un email que falta en la lista) y no un problema del código en sí.

## Estructura de archivos

```
app/
  index.html             login, acceso denegado y shell principal de la app
  css/styles.css          estilos y paleta de colores de la marca
  assets/logo.png         logo de DM Sol Home
  js/supabaseClient.js    conexión a Supabase (URL + Publishable key)
  js/auth.js              login/logout con Google + verificación de allowlist
  js/proveedores.js       módulo ABM de Proveedores
  js/app.js               arranque de la app, sesión y navegación
```

Los próximos módulos (Inventario, Stock, Órdenes de compra, Recepciones,
Usuarios) se agregan como archivos nuevos en `js/`, siguiendo el mismo patrón
que `proveedores.js`.
