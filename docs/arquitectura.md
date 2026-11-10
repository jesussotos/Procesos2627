---
type: Arquitectura
title: Arquitectura de la aplicación
description: Capas comprobadas del backend y frontend, su frontera HTTP y el despliegue.
timestamp: 2026-11-06
---

## Backend

- **API:** [servidor/api.js](../servidor/api.js). Express sirve los archivos estáticos, valida la autenticación y aplica el rol. También es el punto de composición: comprueba que existe `JWT_SECRET` (si no, no arranca), crea el adaptador de correo y lo inyecta en la lógica con `logica.configurarCorreo(...)`.
- **Lógica:** [servidor/logica.js](../servidor/logica.js). Registro (cuenta pendiente + token de confirmación de 24 h; reactiva cuentas eliminadas), confirmación de cuenta, inicio de sesión (solo cuentas activas), comprobación de sesión contra la base de datos, estado de usuario, eliminación lógica con sus permisos, bcrypt, JWT y alta automática del administrador.
- **Datos:** [servidor/datos.js](../servidor/datos.js). Acceso asíncrono a SQLite con `@libsql/client`. Al arrancar prepara la base con reintentos (D-33). Elige la base según el entorno: Turso si existe `TURSO_DATABASE_URL`, el archivo `servidor/database.sqlite` (o `DB_PATH`) si no, y una base en memoria en las pruebas (`NODE_ENV=test`). Al arrancar aplica las migraciones: añade `token_confirmacion` y `token_expira`, convierte la columna booleana `confirmado` en `estado` (`pendiente`, `activo` o `eliminado`) y renombra el rol `usuario` a `profesional`. También crea las tablas `sectores` y `ciudades` y las rellena con los datos de [servidor/catalogos.js](../servidor/catalogos.js): los sectores solo si la tabla está vacía (para no deshacer los cambios del administrador) y las ciudades con `INSERT OR IGNORE`.
- **Perfil:** tablas `perfiles` (uno por usuario), `perfil_sectores` (con la especialidad) y `perfil_ciudades`. `PUT /api/perfil` valida todo antes de escribir y sustituye las listas completas.
- **Servicios:** tabla `servicios` asociada al perfil y a uno de sus sectores, con el tipo de precio, el importe y el precio de la visita en céntimos (D-25), la unidad y el IVA. `GET /api/perfil` devuelve los servicios con los importes ya en euros.
- **Imágenes:** tabla `imagenes` (logo o foto de trabajo, tipo MIME y contenido en un `BLOB`) asociada al usuario. El formato se comprueba por los primeros bytes del archivo, no por la cabecera que envía el cliente.
- **Buscador:** una consulta SQL une perfiles, usuarios, ciudades, servicios y sectores activos, aplica RN-01 y los filtros, agrupa por perfil con `MIN(importe)` como precio de referencia, ordena y pagina con `LIMIT`/`OFFSET`. Los detalles de los 20 resultados se leen con cuatro consultas `IN (...)`, no una por resultado.
- **Utilidades:** [servidor/normalizar.js](../servidor/normalizar.js) quita mayúsculas, tildes y espacios repetidos; lo usan los sectores (RN-05) y la búsqueda de ciudades.
- **Correo:** [servidor/correo.js](../servidor/correo.js). Adaptador de la API HTTP de Brevo (`POST https://api.brevo.com/v3/smtp/email`). Se usa HTTP en lugar de SMTP porque algunos proveedores cloud con capa gratuita bloquean los puertos SMTP salientes. En las pruebas se sustituye por un adaptador falso.

## Frontend

- **Páginas públicas:** [cliente/index.html](../cliente/index.html) (buscador, `/`) y [cliente/ficha.html](../cliente/ficha.html) (ficha de un profesional).
- **Páginas con sesión:** [cliente/acceso.html](../cliente/acceso.html) (inicio de sesión y registro de profesionales y del administrador), [cliente/dashboard.html](../cliente/dashboard.html) («Mi perfil») y [cliente/admin.html](../cliente/admin.html).
- **Estilos** en [cliente/css/](../cliente/css/): `base.css` común, `ficha.css` (la ficha del profesional, reutilizada en la vista previa, los resultados y la ficha de ejemplo) y una hoja por página.
- **Comunicación:** un archivo por página (`rest.js` para el acceso, `buscador.js`, `ficha.js`, `perfil.js`, `admin.js`) y tres compartidos: `precio.js` (formato de precios), `publico.js` (botón de acceso de la barra, enlaces de contacto, logo o iniciales y la tarjeta del profesional, D-32) e `interfaz.js` (desplegables propios y confirmaciones en el sitio, con su hoja `css/interfaz.css`; D-31). Todos usan `fetch` contra `/api/...` y pintan el texto con `textContent`, nunca como HTML.

## Frontera exacta

El navegador cruza la frontera mediante peticiones HTTP a `/api/...`. [servidor/api.js](../servidor/api.js) transforma la petición en una llamada a [servidor/logica.js](../servidor/logica.js); la lógica solicita la persistencia a [servidor/datos.js](../servidor/datos.js) y el envío de correo al adaptador inyectado.

## Endpoints

| Método | Ruta | Quién puede |
|---|---|---|
| POST | `/api/usuarios/registro` | Cualquier cliente |
| POST | `/api/usuarios/login` | Cualquier cliente (solo cuentas confirmadas) |
| GET | `/api/usuarios/confirmar?token=...` | Cualquier cliente con un token válido; redirige a `/?confirmacion=...` |
| GET | `/api/usuarios/me` | Usuario con sesión válida |
| GET | `/api/usuarios` | Administrador con sesión válida |
| GET | `/api/usuarios/:id/activo` | Administrador con sesión válida |
| DELETE | `/api/usuarios/me` | Usuario con sesión válida (su propia cuenta) |
| DELETE | `/api/usuarios/:id` | Usuario con sesión válida; la lógica aplica RN-09 (403 si no tiene permiso) |
| GET | `/api/sectores` | Cualquier cliente (solo sectores activos) |
| GET | `/api/sectores/todos` | Administrador con sesión válida |
| POST | `/api/sectores` | Administrador con sesión válida |
| PATCH | `/api/sectores/:id` | Administrador con sesión válida (cuerpo: `nombre` y/o `activo`) |
| GET | `/api/ciudades?q=texto` | Cualquier cliente (máximo 10 resultados; mínimo 2 letras) |
| GET | `/api/profesionales?ciudad=&sector=&tipo=&max=&orden=&pagina=` | Cualquier cliente; solo perfiles publicados (RN-01) |
| GET | `/api/profesionales/:id` | Cualquier cliente; 404 si el perfil no está publicado |
| GET | `/api/perfil` | Profesional con sesión válida (su propio perfil) |
| PUT | `/api/perfil` | Profesional con sesión válida; sustituye el perfil completo (datos, sectores y ciudades) |
| POST | `/api/perfil/servicios` | Profesional con sesión válida y perfil guardado |
| PUT / DELETE | `/api/perfil/servicios/:id` | Profesional con sesión válida, solo sus servicios (RN-02) |
| PUT / DELETE | `/api/perfil/logo` | Profesional con sesión válida (cuerpo: la imagen, `Content-Type: image/*`) |
| POST | `/api/perfil/fotos` | Profesional con sesión válida (cuerpo: la imagen; máximo 8) |
| DELETE | `/api/perfil/fotos/:id` | Profesional con sesión válida, solo sus fotos (RN-02) |
| GET | `/api/imagenes/:id` | Cualquier cliente; solo imágenes de cuentas activas (RN-08) |

Una sesión es válida si el token JWT es correcto **y** la cuenta sigue activa en la base de datos; el rol se lee de la base de datos, no del token. El registro no acepta el rol desde el cliente: toda cuenta nueva es `profesional`.

## Despliegue

- **Servicio:** Google Cloud Run, región `europe-southwest1`, compilado desde el repositorio en cada cambio de `main`.
- **Base de datos:** Turso (libSQL), fuera del contenedor, porque el sistema de archivos de Cloud Run es efímero.
- **Secretos:** Secret Manager, montados como variables de entorno del servicio.

## Variables de entorno

`PORT`, `DB_PATH`, `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`, `JWT_SECRET` (obligatoria), `ADMIN_PASSWORD`, `BREVO_API_KEY`, `MAIL_FROM`, `MAIL_FROM_NAME`, `APP_URL` (ver `.env.example`).
