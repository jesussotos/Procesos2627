---
type: Proceso
title: Flujo de trabajo y automatización
description: Evidencia comprobada del flujo GitHub Flow, CI y despliegue.
timestamp: 2026-10-28
---

## Flujo de trabajo GitHub Flow

El historial muestra ramas de funcionalidad y commits de merge con mensajes de pull request. Sin `gh` no se puede confirmar el estado de cada PR: **Por verificar: revisar la pestaña Pull requests de GitHub**.

## Integración continua

 [.github/workflows/ci.yml](../.github/workflows/ci.yml) se activa en `push` y `pull_request` hacia `main`. Usa Ubuntu, Node.js 20, `npm ci` y `npm test`. No se pudieron consultar ejecuciones porque `gh` no está disponible.

La integración con Brevo se crea en la composición del backend y se inyecta en la lógica. Las pruebas usan un doble del servicio y no realizan llamadas reales.

## Despliegue continuo

**Pendiente:** no se ha comprobado ningún workflow de despliegue ni una URL pública.
