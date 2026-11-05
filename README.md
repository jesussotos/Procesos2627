# Aplicación SaaS - Procesos de Desarrollo de Software (2026/2027)

![CI Pipeline](https://github.com/jesussotos/Procesos2627/actions/workflows/ci.yml/badge.svg)
![Estado](https://img.shields.io/badge/Estado-Sprint%202%20en%20curso-blue)
![NodeJS](https://img.shields.io/badge/Node.js-v20%2B-green)
![Database](https://img.shields.io/badge/Database-SQLite%20%2F%20Turso-blue)
![Deploy](https://img.shields.io/badge/Deploy-Google%20Cloud%20Run-4285F4)

Este repositorio contiene el desarrollo del proyecto **SaaS** correspondiente a la asignatura de Procesos de Desarrollo de Software. La aplicación implementa una arquitectura por capas con autenticación segura, confirmación de cuenta por correo, control de acceso basado en roles (RBAC), persistencia en una base de datos relacional gestionada, integración continua y despliegue continuo.

## 🌐 Aplicación desplegada

**URL pública:** <https://procesos2627-1055302173608.europe-southwest1.run.app>

- **Proveedor:** Google Cloud Run (región `europe-southwest1`, Madrid).
- **Base de datos en producción:** Turso (SQLite gestionado con libSQL). Los datos se conservan entre reinicios y despliegues.
- **Despliegue continuo:** Cloud Run compila y despliega automáticamente desde este repositorio cada vez que cambia `main`.
- **Secretos:** `JWT_SECRET`, `ADMIN_PASSWORD`, `BREVO_API_KEY` y `TURSO_AUTH_TOKEN` se guardan en Google Secret Manager; nunca en el código.

---

## 📋 Resumen del Sprint 1

Durante el **Sprint 1** se ha desarrollado la arquitectura base de la solución, evolucionando progresivamente desde un prototipo inicial en memoria hasta un sistema seguro con persistencia en SQLite.

### **Hitos Alcanzados**

1. **Hito 1: Lógica en Memoria e Integración Continua (CI)**
   - Inicialización del proyecto y diseño de la capa de dominio en memoria (`servidor/logica.js` y `servidor/datos.js`).
   - Configuración de la batería de pruebas unitarias automatizadas con **Jest**.
   - Integración continua mediante **GitHub Actions** para ejecución de tests automáticos en cada *push* o *pull request*.

2. **Hito 2: Frontend Web, Hash de Contraseñas y Autenticación JWT**
   - Desarrollo de la interfaz de usuario con HTML5, CSS3 y JavaScript vanilla (`cliente/index.html` y `cliente/rest.js`).
   - Hashing seguro de contraseñas mediante **bcryptjs**.
   - Generación y verificación de tokens de autenticación **JSON Web Tokens (JWT)**.
   - Persistencia de sesión en el navegador cliente mediante `localStorage`.

3. **Hito 3: Persistencia Relacional, RBAC, Variables de Entorno y Logs**
   - Migración de la capa de almacenamiento a base de datos relacional **SQLite3** con modelo asíncrono.
   - Control de Acceso Basado en Roles (**RBAC**) distinguiendo usuarios estándar y `admin`.
   - Gestión segura de secretos y puertos mediante **`dotenv`**.
   - Registro de actividad y auditoría del servidor HTTP con el middleware **Morgan**.

---

## 🛠️ Tecnologías Utilizadas

- **Entorno de ejecución:** [Node.js](https://nodejs.org/)
- **Framework Web:** [Express.js](https://expressjs.com/)
- **Base de Datos:** SQLite mediante [`@libsql/client`](https://github.com/tursodatabase/libsql-client-ts): [Turso](https://turso.tech/) en producción, archivo local o memoria en desarrollo y pruebas
- **Correo:** API HTTP de [Brevo](https://www.brevo.com/) para la confirmación de cuentas
- **Seguridad:**
  - Hashing de contraseñas: `bcryptjs`
  - Autenticación: `jsonwebtoken` (JWT)
- **Variables de entorno:** `dotenv`
- **Auditoría / Logging:** `morgan`
- **Testing:** [Jest](https://jestjs.io/)
- **Integración Continua:** GitHub Actions
- **Despliegue Continuo:** Google Cloud Run conectado al repositorio

---

## 🚀 Instalación y Configuración Local

### **1. Clonar el repositorio**
```bash
git clone https://github.com/jesussotos/Procesos2627.git
cd Procesos2627
```

### **2. Instalar dependencias**
```bash
npm install
```

### **3. Configurar las variables de entorno**

Copia `.env.example` como `.env` y rellena los valores. `JWT_SECRET` es **obligatorio**: sin él el servidor no arranca.

| Variable | Obligatoria | Uso |
|---|---|---|
| `JWT_SECRET` | Sí | Firma de los tokens de sesión. |
| `ADMIN_PASSWORD` | No | Si existe, crea `admin@admin.com` al arrancar. |
| `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN` | No | Base de datos en Turso. Sin ellas se usa el archivo local. |
| `DB_PATH` | No | Ruta del archivo SQLite local (por defecto `servidor/database.sqlite`). |
| `BREVO_API_KEY`, `MAIL_FROM`, `MAIL_FROM_NAME` | Sí | Envío del correo de confirmación. |
| `APP_URL` | No | URL base del enlace de confirmación (en producción, la URL pública). |
| `PORT` | No | Puerto del servidor (por defecto 3000). |

### **4. Arrancar y probar**
```bash
npm start      # http://localhost:3000
npm test       # pruebas unitarias de la lógica (Jest)
```

Las pruebas usan siempre una base de datos en memoria y un correo falso, de modo que nunca tocan los datos de Turso ni envían correos.
