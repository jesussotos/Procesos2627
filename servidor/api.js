const express = require('express');
const path = require('path');
const morgan = require('morgan');
require('dotenv').config();
const logica = require('./logica');
const { crearCorreoBrevo } = require('./correo');

// RNF-02: sin JWT_SECRET el servidor no arranca, para no funcionar nunca con un secreto inventado
if (!process.env.JWT_SECRET) {
  console.error('❌ Falta JWT_SECRET en las variables de entorno. El servidor no se inicia.');
  process.exit(1);
}

const app = express();
const PORT = process.env.PORT || 3000;

// Composición: se crea el adaptador de correo y se inyecta en la lógica
logica.configurarCorreo(crearCorreoBrevo({
  apiKey: process.env.BREVO_API_KEY,
  remitente: process.env.MAIL_FROM,
  nombreRemitente: process.env.MAIL_FROM_NAME,
  urlBase: (process.env.APP_URL || `http://localhost:${PORT}`).replace(/\/$/, '')
}));

app.use(express.json());
app.use(morgan('dev'));
app.use(express.static(path.join(__dirname, '../cliente')));

// Middleware de autenticación: token válido y cuenta todavía activa (RN-08)
const requerirAutenticacion = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Acceso no autorizado' });
  }
  const token = authHeader.split(' ')[1];
  try {
    req.usuario = await logica.comprobarSesion(token);
    next();
  } catch (error) {
    res.status(401).json({ error: error.message });
  }
};

// Convierte el :id de la ruta en número; responde 400 si no lo es
function leerId(req, res) {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: 'Identificador de usuario no válido' });
    return null;
  }
  return id;
}

// Middleware para restringir por Rol (RBAC)
const requerirRol = (rolRequerido) => {
  return (req, res, next) => {
    if (!req.usuario || req.usuario.rol !== rolRequerido) {
      return res.status(403).json({ error: 'Acceso prohibido: permisos insuficientes' });
    }
    next();
  };
};

// --- RUTAS PÚBLICAS ---

app.post('/api/usuarios/registro', async (req, res) => {
  try {
    // El rol no se acepta del cliente: quien se registra es siempre profesional
    const { email, password } = req.body;
    const nuevoUsuario = await logica.registrarUsuario(email, password);
    res.status(201).json(nuevoUsuario);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.post('/api/usuarios/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const resultado = await logica.iniciarSesion(email, password);
    res.json(resultado);
  } catch (error) {
    res.status(401).json({ error: error.message });
  }
});

// Enlace que llega por correo: confirma la cuenta y vuelve a la página de inicio con el resultado
app.get('/api/usuarios/confirmar', async (req, res) => {
  try {
    await logica.confirmarCuenta(req.query.token);
    res.redirect('/?confirmacion=ok');
  } catch (error) {
    res.redirect(`/?confirmacion=error&motivo=${encodeURIComponent(error.message)}`);
  }
});

// --- RUTAS PROTEGIDAS ---

app.get('/api/usuarios/me', requerirAutenticacion, (req, res) => {
  res.json({ usuario: req.usuario });
});

// Ruta protegida SOLO para Administradores (Devuelve todos los usuarios)
app.get('/api/usuarios', requerirAutenticacion, requerirRol('admin'), async (req, res) => {
  try {
    const usuarios = await logica.listarUsuarios();
    res.json(usuarios);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// RF-08: comprobar si un usuario está activo (solo administrador)
app.get('/api/usuarios/:id/activo', requerirAutenticacion, requerirRol('admin'), async (req, res) => {
  const id = leerId(req, res);
  if (id === null) return;
  try {
    res.json(await logica.usuarioActivo(id));
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message });
  }
});

// RF-09: el usuario elimina su propia cuenta (va antes de /:id para que "me" no se lea como id)
app.delete('/api/usuarios/me', requerirAutenticacion, async (req, res) => {
  try {
    res.json(await logica.eliminarUsuario(req.usuario, req.usuario.id));
  } catch (error) {
    res.status(error.status || 400).json({ error: error.message });
  }
});

// RF-09: eliminar un usuario. Los permisos (RN-09) los decide la lógica, no la ruta
app.delete('/api/usuarios/:id', requerirAutenticacion, async (req, res) => {
  const id = leerId(req, res);
  if (id === null) return;
  try {
    res.json(await logica.eliminarUsuario(req.usuario, id));
  } catch (error) {
    res.status(error.status || 400).json({ error: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`Servidor corriendo en http://localhost:${PORT}`);
});

module.exports = app;