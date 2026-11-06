---
type: Arquitectura
title: Arquitectura de la aplicación
description: Capas comprobadas del backend y frontend, su frontera HTTP y el despliegue.
timestamp: 2026-11-06
---

## Backend

- **API:** [servidor/api.js](../servidor/api.js). Express sirve los archivos estáticos, valida la autenticación y aplica el rol. También es el punto de composición: comprueba que existe `JWT_SECRET` (si no, no arranca), crea el adaptador de correo y lo inyecta en la lógica con `logica.configurarCorreo(...)`.
- **Lógica:** [servidor/logica.js](../servidor/logica.js). Registro (cuenta pendiente + token de confirmación de 24 h; reactiva cuentas eliminadas), confirmación de cuenta, inicio de sesión (solo cuentas activas), comprobación de sesión contra la base de datos, estado de usuario, eliminación lógica con sus permisos, bcrypt, JWT y alta automática del administrador.
- **Datos:** [servidor/datos.js](../servidor/datos.js). Acceso asíncrono a SQLite con `@libsql/client`. Elige la base según el entorno: Turso si existe `TURSO_DATABASE_URL`, el archivo `servidor/database.sqlite` (o `DB_PATH`) si no, y una base en memoria en las pruebas (`NODE_ENV=test`). Al arrancar aplica las migraciones: añade `token_confirmacion` y `token_expira`, convierte la columna booleana `confirmado` en `estado` (`pendiente`, `activo` o `eliminado`) y renombra el rol `usuario` a `profesional`.
- **Correo:** [servidor/correo.js](../servidor/correo.js). Adaptador de la API HTTP de Brevo (`POST https://api.brevo.com/v3/smtp/email`). Se usa HTTP en lugar de SMTP porque algunos proveedores cloud con capa gratuita bloquean los puertos SMTP salientes. En las pruebas se sustituye por un adaptador falso.

## Frontend

- **Presentación:** [cliente/index.html](../cliente/index.html), [cliente/admin.html](../cliente/admin.html), [cliente/dashboard.html](../cliente/dashboard.html) y [cliente/style.css](../cliente/style.css).
- **Comunicación:** [cliente/rest.js](../cliente/rest.js), que usa `fetch` contra `/api/...` y conserva la sesión en `localStorage`. Muestra el resultado de la confirmación leyendo `?confirmacion=ok|error` de la URL.

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

Una sesión es válida si el token JWT es correcto **y** la cuenta sigue activa en la base de datos; el rol se lee de la base de datos, no del token. El registro no acepta el rol desde el cliente: toda cuenta nueva es `profesional`.

## Despliegue

- **Servicio:** Google Cloud Run, región `europe-southwest1`, compilado desde el repositorio en cada cambio de `main`.
- **Base de datos:** Turso (libSQL), fuera del contenedor, porque el sistema de archivos de Cloud Run es efímero.
- **Secretos:** Secret Manager, montados como variables de entorno del servicio.

## Variables de entorno

`PORT`, `DB_PATH`, `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`, `JWT_SECRET` (obligatoria), `ADMIN_PASSWORD`, `BREVO_API_KEY`, `MAIL_FROM`, `MAIL_FROM_NAME`, `APP_URL` (ver `.env.example`).
