---
type: Requisitos
title: Estado de requisitos
description: Requisitos del Sprint 1 contrastados con el código, el historial y el despliegue.
timestamp: 2026-11-05
---

| ID | Requisito | Estado | Evidencia |
|---|---|---|---|
| ARQ-01 | Separación cliente-servidor y mismo origen | hecho | `api.js` sirve `cliente/` y expone `/api/...`. |
| ARQ-02 | Capas del backend: API, lógica y datos | hecho | `servidor/api.js`, `servidor/logica.js`, `servidor/datos.js`. |
| ARQ-03 | Capas del frontend: presentación y comunicación | hecho | HTML/CSS para presentación y `cliente/rest.js` para comunicación. |
| RF-01 | Registro de usuario local | hecho | `POST /api/usuarios/registro` y `registrarUsuario`. |
| RF-02 | Confirmación de cuenta por correo | hecho | `servidor/correo.js` (API HTTP de Brevo), `GET /api/usuarios/confirmar?token=...`; token de un solo uso con caducidad de 24 h; pruebas 1, 5, 6, 7 y 8. |
| RF-03 | Inicio de sesión local | hecho | `POST /api/usuarios/login` y comprobación con bcrypt. |
| RF-04 | Inicio de sesión con OAuth | pendiente | Planificado en el Sprint 2 (Google). |
| RF-05 | Cierre de sesión | hecho | El cliente elimina `jwt_token` y `rol`. |
| RF-06 | Mantenimiento de la sesión entre recargas | hecho | `localStorage` y `GET /api/usuarios/me`. |
| RF-07 | Listar usuarios (administrador) | hecho | `GET /api/usuarios` exige el rol `admin`. |
| RF-08 | Comprobar si un usuario está activo (administrador) | pendiente | Planificado en el Sprint 2. |
| RF-09 | Eliminar usuario | pendiente | Planificado en el Sprint 2. |
| RF-10 | Creación del primer administrador | hecho | `inicializarAdminPorDefecto` usa `ADMIN_PASSWORD`. |
| RNF-01 | Persistencia en una base de datos real | hecho | SQLite mediante `@libsql/client` en `servidor/datos.js`. |
| RNF-02 | Secretos fuera del código y `.env.example` | hecho | Sin secreto JWT de respaldo: `servidor/api.js` no arranca sin `JWT_SECRET` y `servidor/logica.js` no firma ni verifica tokens sin él (prueba 9). En producción los secretos están en Secret Manager. |
| RNF-03 | Hash seguro de contraseñas | hecho | `bcryptjs` genera salt y hash. |
| RNF-04 | Rutas protegidas por sesión y rol | hecho | Middleware JWT y middleware de rol en `servidor/api.js`. |
| RNF-05 | Despliegue en cloud con URL pública | hecho | Google Cloud Run: <https://procesos2627-1055302173608.europe-southwest1.run.app>. Documentado en el README. |
| RNF-06 | Pruebas unitarias de la lógica (5 o más) | hecho | 9 pruebas en `test/logica.test.js`, con base de datos en memoria y correo falso. Se ejecutan con `npm test` en local y en el CI. |
| RNF-07 | Manejo de errores con feedback al usuario | hecho | La API devuelve errores y el frontend muestra mensajes. |
| RNF-08 | Registro de actividad (log) | hecho | Morgan en `servidor/api.js`; los registros se consultan en Cloud Logging. |
| RNF-09 | Persistencia en producción (Sprint 2) | hecho | Turso como base gestionada. Los registros de Cloud Run muestran `[datos] Base de datos: Turso` y los usuarios se conservan tras redesplegar. |
| PRO-01 | Flujo de trabajo GitHub Flow | Por verificar | Ramas por funcionalidad y merges con mensaje de PR (`#1` a `#16`); comprobar cada PR en GitHub. |
| PRO-02 | Integración continua | Por verificar | `.github/workflows/ci.yml` ejecuta `npm ci` y `npm test` en cada push y PR a `main`; comprobar las ejecuciones en la pestaña Actions. |
| PRO-03 | Despliegue continuo | hecho | Cloud Run está conectado al repositorio y compila y despliega automáticamente cada cambio en `main`, sin pasos manuales (historial de compilaciones de Cloud Build). |
