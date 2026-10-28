---
type: Arquitectura
title: Arquitectura de la aplicación
description: Capas comprobadas del backend y frontend y su frontera HTTP.
timestamp: 2026-10-28
---

## Backend

- **API:** [servidor/api.js](../servidor/api.js). Express sirve los archivos estáticos, valida la autenticación y aplica el rol.
- **Lógica:** [servidor/logica.js](../servidor/logica.js). Registro, inicio de sesión, bcrypt, JWT, dominios permitidos y alta automática del administrador.
- **Datos:** [servidor/datos.js](../servidor/datos.js). Acceso asíncrono a SQLite; la base usada por defecto es `servidor/database.sqlite`.
- **Correo:** [servidor/correo.js](../servidor/correo.js). Adaptador de la API HTTP de Brevo, creado en la composición y recibido por la lógica mediante inyección.

## Frontend

- **Presentación:** [cliente/index.html](../cliente/index.html), [cliente/admin.html](../cliente/admin.html) y [cliente/style.css](../cliente/style.css).
- **Comunicación:** [cliente/rest.js](../cliente/rest.js), que usa `fetch` contra `/api/...` y conserva la sesión en `localStorage`.

## Frontera exacta

El navegador cruza la frontera mediante peticiones HTTP a `/api/...`. [servidor/api.js](../servidor/api.js) transforma la petición en una llamada a [servidor/logica.js](../servidor/logica.js); la lógica solicita la persistencia a [servidor/datos.js](../servidor/datos.js). No se ha comprobado otra frontera.

## Endpoints comprobados

| Método | Ruta | Quién puede |
|---|---|---|
| POST | `/api/usuarios/registro` | Cualquier cliente |
| POST | `/api/usuarios/login` | Cualquier cliente |
| POST | `/api/prueba/dominio` | Cualquier cliente |
| GET | `/api/usuarios/confirmar?token=...` | Cualquier cliente con un token válido |
| GET | `/api/usuarios/me` | Usuario con sesión válida |
| GET | `/api/usuarios` | Administrador con sesión válida |
