---
type: Decisiones
title: Decisiones de diseño
description: Decisiones visibles en el código, el README y el historial.
timestamp: 2026-11-05
---

## D-01: Separar API, lógica y datos

- **Qué se decidió:** Mantener módulos separados para API, lógica y persistencia.
- **Por qué:** El README describe una arquitectura por capas.
- **Estado:** vigente.

## D-02: Evolucionar de memoria a SQLite

- **Qué se decidió:** Sustituir el almacenamiento en memoria por SQLite.
- **Por qué:** El commit `f7443e8` y el README describen la persistencia relacional.
- **Estado:** vigente; en producción la base SQLite está en Turso (ver D-15).

## D-03: Usar JWT y `localStorage` para la sesión

- **Qué se decidió:** Emitir JWT y conservarlo en el navegador.
- **Por qué:** El README y el commit `1e8f9e2` documentan esta implementación.
- **Estado:** vigente.

## D-04: Proteger rutas mediante RBAC

- **Qué se decidió:** Restringir el listado de usuarios al rol `admin`.
- **Por qué:** El README y [servidor/api.js](../servidor/api.js) muestran el middleware de rol.
- **Estado:** vigente.

## D-05: Configurar dominios permitidos

- **Qué se decidió:** Leer los dominios permitidos desde `ALLOWED_DOMAINS`.
- **Por qué:** El commit `c2b7fea` se titula “variante 3 implementada”.
- **Estado:** revertida. El commit `0838925` (“Revert "Implementada variante 3"”, PR `#15`) la retiró y ya no está en el código.

## D-06: Alta automática del administrador

- **Qué se decidió:** Crear el administrador al arrancar si está configurado `ADMIN_PASSWORD`.
- **Por qué:** El commit `8718f29` y [servidor/logica.js](../servidor/logica.js) lo documentan.
- **Estado:** vigente.

Las decisiones D-07 a D-13 del dominio del Sprint 2 están en la especificación de requisitos del Sprint 2.

## D-14: Correo de confirmación mediante la API HTTP de Brevo

- **Qué se decidió:** Enviar el correo de confirmación con la API HTTP de Brevo desde un adaptador inyectado en la lógica ([servidor/correo.js](../servidor/correo.js)). El token es de un solo uso y caduca a las 24 horas.
- **Por qué:** Algunos proveedores cloud con capa gratuita bloquean los puertos SMTP salientes; la API HTTP usa el puerto 443. Inyectar el adaptador permite usar un doble en las pruebas.
- **Estado:** vigente. Sustituye al planteamiento inicial con Gmail SMTP.

## D-15: Base de datos gestionada en Turso

- **Qué se decidió:** Usar Turso (SQLite gestionado con libSQL) como base de datos de producción mediante `@libsql/client`, conservando el mismo esquema y SQL.
- **Por qué:** El sistema de archivos de Cloud Run es efímero y el archivo SQLite se perdía en cada despliegue o reinicio (RNF-09). Turso es compatible con SQLite y tiene capa gratuita, así que solo cambió la capa de datos y la lógica no se tocó (D-01).
- **Estado:** vigente.

## D-16: Sin secreto JWT de respaldo

- **Qué se decidió:** Eliminar el valor por defecto de `JWT_SECRET`; el servidor no arranca sin él.
- **Por qué:** Un secreto escrito en el código es público en el repositorio y permitiría falsificar tokens si faltara la variable en producción (RNF-02).
- **Estado:** vigente.

Para cualquier motivo no citado aquí: **TODO(alumno): indicar la fuente concreta de la decisión.**
