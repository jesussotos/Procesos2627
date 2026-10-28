---
type: Requisitos
title: Estado de requisitos
description: Requisitos del Sprint 1 contrastados con el código y el historial.
timestamp: 2026-10-28
---

| ID | Requisito | Estado | Evidencia |
|---|---|---|---|
| ARQ-01 | Separación cliente-servidor y mismo origen | hecho | `api.js` sirve `cliente/` y expone `/api/...`. |
| ARQ-02 | Capas del backend: API, lógica y datos | hecho | `servidor/api.js`, `servidor/logica.js`, `servidor/datos.js`. |
| ARQ-03 | Capas del frontend: presentación y comunicación | hecho | HTML/CSS para presentación y `cliente/rest.js` para comunicación. |
| RF-01 | Registro de usuario local | hecho | `POST /api/usuarios/registro` y `registrarUsuario`. |
| RF-02 | Confirmación de cuenta por correo | hecho | `servidor/correo.js`, `GET /api/usuarios/confirmar?token=...` y pruebas de envío con doble, caducidad y consumo único. |
| RF-03 | Inicio de sesión local | hecho | `POST /api/usuarios/login` y comprobación con bcrypt. |
| RF-04 | Inicio de sesión con OAuth | pendiente | No hay ruta ni proveedor OAuth comprobado. |
| RF-05 | Cierre de sesión | hecho | El cliente elimina `jwt_token` y `rol`. |
| RF-06 | Mantenimiento de la sesión entre recargas | hecho | `localStorage` y `GET /api/usuarios/me`. |
| RF-07 | Listar usuarios (administrador) | hecho | `GET /api/usuarios` exige el rol `admin`. |
| RF-08 | Comprobar si un usuario está activo (administrador) | pendiente | No hay endpoint específico comprobado. |
| RF-09 | Eliminar usuario | pendiente | No hay ruta ni operación comprobada. |
| RF-10 | Creación del primer administrador | hecho | `inicializarAdminPorDefecto` usa `ADMIN_PASSWORD`. |
| RNF-01 | Persistencia en una base de datos real | hecho | SQLite en `servidor/datos.js`. |
| RNF-02 | Secretos fuera del código y `.env.example` | parcial | Existe `.env.example`, pero hay un secreto JWT de respaldo en `servidor/logica.js`. |
| RNF-03 | Hash seguro de contraseñas | hecho | `bcryptjs` genera salt y hash. |
| RNF-04 | Rutas protegidas por sesión y rol | hecho | Middleware JWT y middleware de rol en `servidor/api.js`. |
| RNF-05 | Despliegue en cloud con URL pública | pendiente | No hay configuración de despliegue ni URL pública comprobada. |
| RNF-06 | Pruebas unitarias de la lógica (5 o más) | hecho | `npm test -- --runInBand`: 1 suite y 12 tests pasados en `test/logica.test.js`. |
| RNF-07 | Manejo de errores con feedback al usuario | hecho | API devuelve errores y el frontend muestra mensajes. |
| RNF-08 | Registro de actividad (log) | hecho | Morgan está configurado en `servidor/api.js`. |
| PRO-01 | Flujo de trabajo GitHub Flow | Por verificar | El historial contiene merges con mensajes de PR; comprobar PR en GitHub. |
| PRO-02 | Integración continua | Por verificar | `.github/workflows/ci.yml` ejecuta `npm ci` y `npm test`; no se comprobaron ejecuciones. |
| PRO-03 | Despliegue continuo | pendiente | No hay workflow de despliegue comprobado. |
