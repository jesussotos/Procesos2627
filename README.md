# Aplicación SaaS - Procesos de Desarrollo de Software (2026/2027)

![CI Pipeline](https://github.com/jesussotos/Procesos2627/actions/workflows/ci.yml/badge.svg)
![Estado](https://img.shields.io/badge/Estado-Sprint%201%20Completado-brightgreen)
![NodeJS](https://img.shields.io/badge/Node.js-v18%2B-green)
![Database](https://img.shields.io/badge/Database-SQLite3-blue)

Este repositorio contiene el desarrollo del proyecto **SaaS** correspondiente a la asignatura de Procesos de Desarrollo de Software. La aplicación implementa una arquitectura por capas con autenticación segura, control de acceso basado en roles (RBAC), persistencia en base de datos relacional e integración continua.

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
- **Base de Datos:** [SQLite3](https://www.sqlite.org/)
- **Seguridad:**
  - Hashing de contraseñas: `bcryptjs`
  - Autenticación: `jsonwebtoken` (JWT)
- **Variables de entorno:** `dotenv`
- **Auditoría / Logging:** `morgan`
- **Testing:** [Jest](https://jestjs.io/)
- **Integración Continua:** GitHub Actions

---

## 🚀 Instalación y Configuración Local

Sigue estos pasos para desplegar el proyecto localmente en tu entorno de desarrollo:

### **1. Clonar el repositorio**
```bash
git clone [https://github.com/jesussotos/Procesos2627.git](https://github.com/jesussotos/Procesos2627.git)
cd Procesos2627