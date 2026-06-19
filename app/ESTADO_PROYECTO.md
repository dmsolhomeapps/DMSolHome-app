# Estado del proyecto - DM Sol Home Apps

Este documento es el resumen para retomar el trabajo en una conversación
nueva con Claude. Subilo o pegá su contenido al empezar, junto con los
archivos de la app si hace falta tocar código.

## Qué es esto

App de gestión de compras e inventario para el emprendimiento de muebles
DM Sol Home. Maneja proveedores (carpinteros y pintores), catálogo de
artículos, stock, órdenes de compra y recepciones. Pensada para ampliarse
a futuro como "DM Sol Home Apps" (paraguas para más herramientas internas).

## Arquitectura elegida (y por qué)

- **Base de datos**: Supabase (Postgres), plan gratis. Se eligió sobre
  Google Sheets/Apps Script porque el modelo es genuinamente relacional
  (órdenes de compra con ítems, recepciones parciales, stock calculado).
- **Frontend**: HTML/CSS/JS plano, sin frameworks ni paso de build (mismo
  estilo que `control-ingreso.html` de Pinocho, pero conectado a Supabase
  en vez de Apps Script). Cada módulo es un archivo JS independiente en
  `js/`, con un patrón consistente: `init<Modulo>()` que arma el HTML una
  vez y carga los datos.
- **Hosting**: GitHub Pages (gratis, sin límite de despliegues - se probó
  Netlify primero pero cambió a un sistema de créditos limitado en 2026).
  Repositorio: `dmsolhomeapps/DMSolHome-app` (público; no hay datos
  sensibles en el código, solo la URL de Supabase y la Publishable key,
  que están pensadas para ser públicas).
- **Login**: Google OAuth vía Supabase Auth, restringido a 3 personas
  mediante una tabla allowlist (`emails_autorizados`), no por verificación
  de Google (innecesaria para un equipo interno de 3 personas).

## Modelo de datos (Postgres en Supabase)

Tablas: `proveedores`, `inventario` (catálogo unificado de SKUs, sin
separar producto/variante), `ordenes_compra`, `ordenes_compra_items`,
`recepciones`, `recepciones_items`, `unidades` (una fila por mueble físico
individual, con código QR autogenerado tipo `U-000001`), `emails_autorizados`,
`perfiles`.

Decisiones clave del modelo:
- Sin trazabilidad de lote entre carpintero y pintor a nivel de orden de
  compra (se maneja por cantidades). Pero sí hay trazabilidad por pieza
  física una vez que el mueble entra al local, vía la tabla `unidades` y
  su QR (estado, pintado/laqueado, quién lo pintó, fecha de ingreso).
- El stock no es un campo que se pisa: se calcula contando unidades en
  estado `en_stock` por SKU (vista `stock_actual`).
- `peso_volumetrico_kg` es una columna generada en la base (fórmula
  alto×largo×profundidad/4000, o alto×diámetro² /4000 para piezas
  redondas) - nunca se manda desde el frontend, Postgres la calcula sola.
- Todas las tablas tienen who-columns estilo Oracle: `creado_por`,
  `creado_en`, `actualizado_por`, `actualizado_en`, completadas solas por
  un trigger genérico usando `auth.uid()`.
- "Orden de compra" y "solicitud de compra" son la misma tabla/concepto.
- RLS en todas las tablas: solo accede quien esté en `emails_autorizados`
  (función `fn_usuario_autorizado()`).

El SQL completo y actualizado vive en `schema.sql` (el archivo que ya
tenés). Si hace falta volver a crearlo todo de cero en otro proyecto de
Supabase, ese archivo solo alcanza.

## Pendiente de resolver más adelante (no urgente)

- Costo de compra con historial de precios por proveedor/producto, para
  poder hacer ajustes parciales o totales.
- Sincronización de stock con Mercado Libre (y a futuro Tiendanube).

## Estado del frontend (pantallas)

- ✅ Login con Google + control de acceso
- ✅ ABM Proveedores
- ✅ ABM Inventario
- ✅ Stock (vista actual + filtros + búsqueda por código QR)
- ✅ Órdenes de compra (alta con ítems + listado + detalle)
- ✅ Recepciones (registrar lo que llega contra una orden, total o parcial)
- ⬜ Usuarios (ABM de la tabla `emails_autorizados` desde la app, hoy se
  carga a mano por SQL Editor)

Pendiente de probar de punta a punta: crear una orden de compra, registrar
una recepción contra ella (total o parcial) y confirmar que el stock y el
estado de la orden se actualizan solos.

## Identidad visual

Paleta sacada del logo real (no a ojo): fondo crema `#F4ECE1`, verde oliva
oscuro `#61552B` (textos/botones principales), amarillo mostaza `#EAC634`
(acento). El logo está en `assets/logo.png`.

## Gotchas ya resueltos (por si vuelven a aparecer)

- Si el login da error 400 `redirect_uri_mismatch`: el redirect URI en
  Google Cloud Console no coincide con el callback de Supabase.
- Si el login da "Database error saving new user": revisar que las
  funciones con `security definer` en triggers sobre `auth.users` tengan
  las tablas calificadas con `public.` y `set search_path = public` (si
  no, fallan silenciosamente por el search_path).
- Si algo se ve desalineado/raro después de subir un cambio y no entendés
  por qué: probablemente es caché del navegador - probar con Ctrl+Shift+R
  antes de asumir que el código está mal.
