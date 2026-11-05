---
type: Proceso
title: Flujo de trabajo y automatización
description: Evidencia del flujo GitHub Flow, CI y despliegue continuo.
timestamp: 2026-11-05
---

## Flujo de trabajo GitHub Flow

Cada requisito o grupo pequeño de requisitos se desarrolla en una rama propia (`feature/...`, `feat/...`, `chore/...`) y se integra en `main` mediante un pull request. El historial contiene merges con mensaje de PR desde `#1` hasta `#16`. **Por verificar: revisar la pestaña Pull requests de GitHub.**

## Integración continua

[.github/workflows/ci.yml](../.github/workflows/ci.yml) se activa en `push` y `pull_request` hacia `main`. Usa Ubuntu, Node.js 20, `npm ci` y `npm test`. Las pruebas no necesitan secretos: usan una base de datos en memoria, un correo falso y un `JWT_SECRET` propio de las pruebas. No se integra un PR con el CI en rojo.

## Despliegue continuo

Google Cloud Run está conectado al repositorio: cada cambio en `main` se compila y se despliega automáticamente, sin pasos manuales. El historial de compilaciones se consulta en la página del servicio en Cloud Run.

- **URL pública:** <https://procesos2627-1055302173608.europe-southwest1.run.app>
- **Configuración:** variables de entorno del servicio y secretos de Secret Manager (`JWT_SECRET`, `ADMIN_PASSWORD`, `BREVO_API_KEY`, `TURSO_AUTH_TOKEN`).
- **Comprobación tras desplegar:** en Cloud Logging debe aparecer `[datos] Base de datos: Turso` al arrancar la instancia.
