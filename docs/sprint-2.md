---
type: Sprint
title: Sprint 2
description: Objetivo del Sprint 2 y estado de los requisitos que pasan del Sprint 1.
timestamp: 2026-11-06
---

## Objetivo

Convertir la gestión de usuarios del Sprint 1 en un directorio de profesionales a domicilio: los profesionales publican servicios con precio y zona de actuación, y cualquier visitante los encuentra por sector, ciudad y precio. El detalle está en la especificación de requisitos del Sprint 2.

## Requisitos que pasan del Sprint 1

| ID | Estado | Nota |
|---|---|---|
| RF-04 | pendiente | Inicio de sesión con Google. |
| RF-08 | hecho | `GET /api/usuarios/:id/activo` y botón «¿Activo?» en el panel de administración. |
| RF-09 | hecho | Borrado lógico desde el panel de administración y desde «Eliminar mi cuenta». |
| RNF-02 | hecho | Sin secreto JWT de respaldo; el servidor no arranca sin `JWT_SECRET`. |
| RNF-05 | hecho | Desplegado en Google Cloud Run; URL en el README. |
| RNF-06 | hecho | 19 pruebas con `npm test`; se ampliarán con las reglas de negocio del Sprint 2. |
| PRO-01 | Por verificar | Comprobar los PR en GitHub. |
| PRO-02 | Por verificar | Comprobar las ejecuciones del CI en GitHub. |
| PRO-03 | hecho | Cloud Run despliega automáticamente cada cambio en `main`. |

## Requisitos nuevos ya cerrados

- **RNF-09:** persistencia en producción con Turso (D-15).
- **Estado de usuario y roles:** `estado` (`pendiente`, `activo`, `eliminado`) sustituye a `confirmado` y el rol `usuario` pasa a `profesional`.
- **RN-08, RN-09 y RN-11:** borrado lógico, permisos de eliminación y reactivación de cuentas eliminadas (D-17).
