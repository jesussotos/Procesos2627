const express = require('express');
const path = require('path');
const logica = require('./logica');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// Servir la capa de cliente (archivos estáticos)
app.use(express.static(path.join(__dirname, '../cliente')));

// --- RUTAS PÚBLICAS ---

// Registrar usuario
app.post('/api/usuarios/registro', (req, res) => {
  try {
    const { email, password } = req.body;
    const nuevoUsuario = logica.registrarUsuario(email, password);
    res.status(201).json(nuevoUsuario);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Iniciar sesión
app.post('/api/usuarios/login', (req, res) => {
  try {
    const { email, password } = req.body;
    const resultado = logica.iniciarSesion(email, password);
    res.json(resultado);
  } catch (error) {
    res.status(401).json({ error: error.message });
  }
});

// Middleware de autenticación
const requerirAutenticacion = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Acceso no autorizado' });
  }
  const token = authHeader.split(' ')[1];
  try {
    req.usuario = logica.verificarToken(token);
    next();
  } catch (error) {
    res.status(401).json({ error: error.message });
  }
};

// --- RUTAS PROTEGIDAS ---

app.get('/api/usuarios/me', requerirAutenticacion, (req, res) => {
  res.json({ usuario: req.usuario });
});

app.get('/api/usuarios', requerirAutenticacion, (req, res) => {
  try {
    const usuarios = logica.listarUsuarios();
    res.json(usuarios);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Arrancar el servidor
const servidor = app.listen(PORT, () => {
  console.log(`Servidor corriendo en http://localhost:${PORT}`);
});

module.exports = { app, servidor };