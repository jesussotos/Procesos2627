---
type: Decisiones
title: Decisiones de diseño
description: Decisiones visibles en el código, el README y el historial.
timestamp: 2026-10-28
---

## D-01: Separar API, lógica y datos

- **Qué se decidió:** Mantener módulos separados para API, lógica y persistencia.
- **Por qué:** El README describe una arquitectura por capas.
- **Estado:** vigente.

## D-02: Evolucionar de memoria a SQLite

- **Qué se decidió:** Sustituir el almacenamiento en memoria por SQLite.
- **Por qué:** El commit `f7443e8` y el README describen la persistencia relacional.
- **Estado:** vigente.

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
- **Por qué:** El commit `c2b7fea` se titula “variante 3 implementada” y el código lo implementa.
- **Estado:** vigente.

## D-06: Alta automática del administrador

- **Qué se decidió:** Crear el administrador al arrancar si está configurado `ADMIN_PASSWORD`.
- **Por qué:** El commit `8718f29` y [servidor/logica.js](../servidor/logica.js) lo documentan.
- **Estado:** vigente.

Para cualquier motivo no citado aquí: **TODO(alumno): indicar la fuente concreta de la decisión.**

