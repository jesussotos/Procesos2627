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
| RF-04 | hecho | Inicio de sesión con Google: botón «Continuar con Google» en `/acceso.html` (D-34). |
| RF-08 | hecho | `GET /api/usuarios/:id/activo` y botón «¿Activo?» en el panel de administración. |
| RF-09 | hecho | Borrado lógico desde el panel de administración y desde «Eliminar mi cuenta». |
| RNF-02 | hecho | Sin secreto JWT de respaldo; el servidor no arranca sin `JWT_SECRET`. |
| RNF-05 | hecho | Desplegado en Google Cloud Run; URL en el README. |
| RNF-06 | hecho | 70 pruebas con `npm test`, incluidas las del acceso con Google. |
| PRO-01 | Por verificar | Comprobar los PR en GitHub. |
| PRO-02 | Por verificar | Comprobar las ejecuciones del CI en GitHub. |
| PRO-03 | hecho | Cloud Run despliega automáticamente cada cambio en `main`. |

## Requisitos nuevos ya cerrados

- **RNF-09:** persistencia en producción con Turso (D-15).
- **Estado de usuario y roles:** `estado` (`pendiente`, `activo`, `eliminado`) sustituye a `confirmado` y el rol `usuario` pasa a `profesional`.
- **RN-08, RN-09 y RN-11:** borrado lógico, permisos de eliminación y reactivación de cuentas eliminadas (D-17).
- **Buscador y ficha pública (paso 6):** RF-16 a RF-21, RN-01 y RNF-10 a RNF-13; el buscador pasa a ser la página principal (D-29).
- **Servicios con precio (paso 5):** RF-14, RF-15, RN-03 y RN-06, con un sexto tipo de precio, el presupuesto cerrado (D-26).
- **Logo y fotos de trabajos (RF-23, nuevo):** ampliación del alcance, guardadas en Turso (D-24).
- **Perfil del profesional (paso 4):** RF-11, RF-12, RF-13, RN-02, RN-04, RN-07 y RN-10; página «Mi perfil».
- **Catálogos (paso 3):** RF-17, RF-22, RN-05 y la parte de RN-04 que afecta al catálogo; 12 sectores iniciales y 145 ciudades (D-19).

## Plan del sprint

| Paso | Contenido | Estado |
|---|---|---|
| 1 | Cierre de pendientes del Sprint 1 | hecho |
| 2 | Estado de usuario y roles | hecho |
| 3 | Catálogos de sectores y ciudades | hecho |
| 4 | Perfil del profesional (RF-11 a RF-13) | hecho |
| 5 | Servicios con precio (RF-14, RF-15) | hecho |
| 6 | Búsqueda y ficha pública (RF-18 a RF-21) | hecho |
| 7 | Inicio de sesión con Google (RF-04) | hecho |
