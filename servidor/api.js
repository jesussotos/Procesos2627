const express = require('express');
const path = require('path');
const logica = require('./logica');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware para entender JSON y formularios
app.use(express.json());

// Servir los archivos estáticos del frontend (cliente)
app.use(express.static(path.join(__dirname, '../cliente')));

// --- RUTAS DE LA API (Capa de Presentación Backend) ---

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

// Listar usuarios
app.get('/api/usuarios', (req, res) => {
  try {
    const usuarios = logica.listarUsuarios();
    res.json(usuarios);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Comprobar si un usuario está activo
app.get('/api/usuarios/:email/activo', (req, res) => {
  try {
    const activo = logica.estaActivo(req.params.email);
    res.json({ email: req.params.email, activo });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Eliminar usuario
app.delete('/api/usuarios/:email', (req, res) => {
  try {
    logica.eliminarUsuario(req.params.email);
    res.json({ mensaje: 'Usuario eliminado correctamente' });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Iniciar servidor solo si no estamos en modo test
if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, () => {
    console.log(`Servidor corriendo en http://localhost:${PORT}`);
  });
}

module.exports = app;