---
type: Requisitos
title: Estado de requisitos
description: Requisitos del Sprint 1 contrastados con el código, el historial y el despliegue.
timestamp: 2026-11-06
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
| RF-07 | Listar usuarios (administrador) | hecho | `GET /api/usuarios` exige el rol `admin` y devuelve email, rol y estado; `cliente/admin.html` los muestra (prueba 19). |
| RF-08 | Comprobar si un usuario está activo (administrador) | hecho | `GET /api/usuarios/:id/activo`, solo `admin`; `logica.usuarioActivo` (pruebas 10 y 11). Activo = estado `activo`. |
| RF-09 | Eliminar usuario | hecho | `DELETE /api/usuarios/:id` y `DELETE /api/usuarios/me`; borrado lógico con RN-08 y RN-09 aplicadas en `logica.eliminarUsuario` (pruebas 12 a 17). |
| RF-10 | Creación del primer administrador | hecho | `inicializarAdminPorDefecto` usa `ADMIN_PASSWORD`. |
| RNF-01 | Persistencia en una base de datos real | hecho | SQLite mediante `@libsql/client` en `servidor/datos.js`. |
| RNF-02 | Secretos fuera del código y `.env.example` | hecho | Sin secreto JWT de respaldo: `servidor/api.js` no arranca sin `JWT_SECRET` y `servidor/logica.js` no firma ni verifica tokens sin él (prueba 9). En producción los secretos están en Secret Manager. |
| RNF-03 | Hash seguro de contraseñas | hecho | `bcryptjs` genera salt y hash. |
| RNF-04 | Rutas protegidas por sesión y rol | hecho | Middleware JWT y middleware de rol en `servidor/api.js`. |
| RNF-05 | Despliegue en cloud con URL pública | hecho | Google Cloud Run: <https://procesos2627-1055302173608.europe-southwest1.run.app>. Documentado en el README. |
| RNF-06 | Pruebas unitarias de la lógica (5 o más) | hecho | 44 pruebas en `test/logica.test.js`, con base de datos en memoria y correo falso. Se ejecutan con `npm test` en local y en el CI. |
| RNF-07 | Manejo de errores con feedback al usuario | hecho | La API devuelve errores y el frontend muestra mensajes. |
| RNF-08 | Registro de actividad (log) | hecho | Morgan en `servidor/api.js`; los registros se consultan en Cloud Logging. |
| RNF-10 | Validación en el servidor y texto escapado en el cliente | parcial | El perfil se valida y limpia en la lógica; las páginas pintan los textos con `textContent`. Falta aplicarlo a la ficha y el buscador (paso 6). |
| RNF-11 | El email de acceso nunca se muestra | parcial | El perfil tiene un email de contacto propio, distinto del de acceso. Se comprobará en la ficha pública (paso 6). |
| RNF-09 | Persistencia en producción (Sprint 2) | hecho | Turso como base gestionada. Los registros de Cloud Run muestran `[datos] Base de datos: Turso` y los usuarios se conservan tras redesplegar. |
| PRO-01 | Flujo de trabajo GitHub Flow | Por verificar | Ramas por funcionalidad y merges con mensaje de PR (`#1` a `#16`); comprobar cada PR en GitHub. |
| PRO-02 | Integración continua | Por verificar | `.github/workflows/ci.yml` ejecuta `npm ci` y `npm test` en cada push y PR a `main`; comprobar las ejecuciones en la pestaña Actions. |
| PRO-03 | Despliegue continuo | hecho | Cloud Run está conectado al repositorio y compila y despliega automáticamente cada cambio en `main`, sin pasos manuales (historial de compilaciones de Cloud Build). |

## Reglas de negocio del Sprint 2

| ID | Regla | Estado | Evidencia |
|---|---|---|---|
| RN-08 | Un usuario eliminado no puede iniciar sesión; borrado lógico | hecho | Estado `eliminado`; `iniciarSesion` lo rechaza y `comprobarSesion` invalida sus tokens abiertos (pruebas 16 y 17). |
| RN-09 | Un profesional solo se elimina a sí mismo; el admin elimina a cualquiera menos a sí mismo | hecho | `logica.eliminarUsuario` (pruebas 12 a 15). |
| RN-11 | Una cuenta eliminada puede volver a registrarse con el mismo correo | hecho | `registrarUsuario` reactiva la misma fila como `pendiente` (prueba 18). |
| RN-04 | Solo se eligen sectores activos; desactivar oculta sin borrar | hecho | Desactivar oculta el sector de `GET /api/sectores` sin borrarlo (prueba 24). `guardarPerfil` rechaza añadir un sector desactivado; quien ya lo tenía puede conservarlo (pruebas 31 y 32). |
| RN-02 | Un profesional solo toca su propio perfil | hecho | `/api/perfil` no recibe id: el perfil se obtiene de la sesión; el administrador no tiene perfil (prueba 37). Los servicios se añadirán en el paso 5. |
| RN-07 | Ciudades del catálogo y sin repetir | hecho | `guardarPerfil` comprueba cada ciudad y los duplicados (prueba 33). |
| RN-10 | Límites de longitud de los textos | hecho | Nombre comercial 80, especialidad 150, descripción 1.000 (prueba 34). El título de servicio llegará en el paso 5. |
| RN-05 | Nombres de sector únicos sin distinguir mayúsculas ni tildes | hecho | Columna `nombre_normalizado` con índice `UNIQUE` y comprobación en `crearSector` y `renombrarSector` (pruebas 21 y 22). |

## Requisitos funcionales del Sprint 2

| ID | Requisito | Estado | Evidencia |
|---|---|---|---|
| RF-11 | Crear y editar el perfil | hecho | `GET` y `PUT /api/perfil`; página «Mi perfil» (`cliente/dashboard.html`). Nombre comercial obligatorio y al menos un dato de contacto válido (pruebas 29, 35 y 36). |
| RF-12 | Elegir sectores con especialidad | hecho | Casillas con especialidad obligatoria en «Mi perfil» (pruebas 29, 30 y 35). |
| RF-13 | Definir la zona de actuación | hecho | Autocompletado de ciudades y lista de ciudades elegidas en «Mi perfil» (pruebas 29, 30 y 33). |
| RF-16 | Ver si el perfil está publicado y qué le falta | parcial | «Mi perfil» muestra el progreso (nombre, contacto, sectores y zona) y una vista previa de la ficha. Faltan los servicios (paso 5) y el cálculo de RN-01 en el servidor. |
| RF-23 | Logo y fotos de trabajos (opcionales) | hecho | Nuevo, ampliación del alcance (D-24). `PUT`/`DELETE /api/perfil/logo`, `POST /api/perfil/fotos`, `DELETE /api/perfil/fotos/:id` y `GET /api/imagenes/:id`; como máximo 8 fotos de 600 KB; el navegador reduce las imágenes antes de subirlas (pruebas 39 a 44). |
| RF-17 | Consultar la lista de sectores activos | hecho | `GET /api/sectores`, público (pruebas 20 y 24). |
| RF-22 | Gestionar el catálogo de sectores | hecho | `POST /api/sectores` y `PATCH /api/sectores/:id` (solo `admin`); sección «Sectores» de `cliente/admin.html` (pruebas 20 a 26). |
| Catálogo de ciudades | Municipios precargados con provincia y autocompletado | hecho | Tabla `ciudades` (145 ciudades, D-19) y `GET /api/ciudades?q=` sin distinguir tildes (pruebas 27 y 28). |
