---
type: Sprint
title: Sprint 1
description: Hitos comprobados del Sprint 1 y retrospectiva basada en commits.
timestamp: 2026-10-28
---

## Hito 1: backend y CI

- **Objetivo:** Por verificar: consultar el apartado 10 de la especificación.
- **Qué se hizo:** `a644922` implementa lógica en memoria, API Express y workflow CI.
- **PR:** Por verificar en Pull requests de GitHub; el historial contiene el merge `#2`.
- **Etiqueta:** No hay etiqueta comprobada.
- **Desviaciones:** Por verificar en GitHub.

## Hito 2: frontend y sesión

- **Objetivo:** Por verificar: consultar el apartado 10 de la especificación.
- **Qué se hizo:** `1e8f9e2` implementa interfaz, JWT y manejo de errores.
- **PR:** Por verificar en Pull requests de GitHub; el historial contiene el merge `#3`.
- **Etiqueta:** No hay etiqueta comprobada.
- **Desviaciones:** Por verificar en GitHub.

## Hito 3: persistencia y roles

- **Objetivo:** Por verificar: consultar el apartado 10 de la especificación.
- **Qué se hizo:** `f7443e8` implementa SQLite, variables de entorno, RBAC y logs.
- **PR:** Por verificar en Pull requests de GitHub; el historial contiene el merge `#4`.
- **Etiqueta:** No hay etiqueta comprobada.
- **Desviaciones:** Por verificar en GitHub.

## Retrospectiva

### Hechos

- El historial de `main` contiene 8 commits de merge con mensaje de pull request: `#1`, `#2`, `#3`, `#4`, `#5`, `#6`, `#7` y `#9`; el recuento procede de `git log --first-parent` y no confirma el estado actual en GitHub.
- No hay etiquetas comprobadas.
- Hay 8 declaraciones `test` en el archivo de pruebas, recuento aproximado por grep; la ejecución falló por falta de `jest`.

### Qué funcionó

TODO(alumno): confirmar en GitHub qué PR y ejecuciones del CI se integraron correctamente.

### Qué cambiaría

TODO(alumno): indicar una mejora de proceso respaldada por la especificación o por una incidencia del historial.
