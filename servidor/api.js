const express = require('express');
const path = require('path');
const crypto = require('crypto');
const morgan = require('morgan');
require('dotenv').config();
const logica = require('./logica');
const { crearCorreoBrevo } = require('./correo');
const { crearAccesoGoogle } = require('./google');

// RNF-02: sin JWT_SECRET el servidor no arranca, para no funcionar nunca con un secreto inventado
if (!process.env.JWT_SECRET) {
  console.error('❌ Falta JWT_SECRET en las variables de entorno. El servidor no se inicia.');
  process.exit(1);
}

const app = express();
const PORT = process.env.PORT || 3000;
// URL pública de la aplicación: la usan el enlace de confirmación y la vuelta desde Google
const URL_BASE = (process.env.APP_URL || `http://localhost:${PORT}`).replace(/\/$/, '');

// Composición: se crean los adaptadores de correo y de Google y se inyectan en la lógica
logica.configurarCorreo(crearCorreoBrevo({
  apiKey: process.env.BREVO_API_KEY,
  remitente: process.env.MAIL_FROM,
  nombreRemitente: process.env.MAIL_FROM_NAME,
  urlBase: URL_BASE
}));

const accesoGoogle = crearAccesoGoogle({
  clientId: process.env.GOOGLE_CLIENT_ID,
  clientSecret: process.env.GOOGLE_CLIENT_SECRET,
  urlRetorno: `${URL_BASE}/api/oauth/google/retorno`
});
logica.configurarGoogle(accesoGoogle);
if (!accesoGoogle) {
  console.warn('[google] Faltan GOOGLE_CLIENT_ID o GOOGLE_CLIENT_SECRET: el acceso con Google queda desactivado');
}

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
    res.status(400).json({ error: 'Identificador no válido' });
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

// Enlace que llega por correo: confirma la cuenta y vuelve a la página de acceso con el resultado
app.get('/api/usuarios/confirmar', async (req, res) => {
  try {
    await logica.confirmarCuenta(req.query.token);
    res.redirect('/acceso.html?confirmacion=ok');
  } catch (error) {
    res.redirect(`/acceso.html?confirmacion=error&motivo=${encodeURIComponent(error.message)}`);
  }
});

// --- ACCESO CON GOOGLE (RF-04, D-34) ---

// Cookie con el valor `state` de OAuth: al volver de Google se compara con el que trae la URL,
// para que nadie pueda colar en tu navegador un acceso que no has empezado tú (CSRF)
const COOKIE_ESTADO = 'oauth_estado';
const OPCIONES_COOKIE_ESTADO = {
  httpOnly: true,
  sameSite: 'lax',
  secure: URL_BASE.startsWith('https://'),
  path: '/api/oauth'
};

function leerCookie(req, nombre) {
  for (const parte of (req.headers.cookie || '').split(';')) {
    const [clave, ...valor] = parte.trim().split('=');
    if (clave === nombre) return decodeURIComponent(valor.join('='));
  }
  return null;
}

function volverConErrorGoogle(res, motivo) {
  res.redirect(`/acceso.html?google=error&motivo=${encodeURIComponent(motivo)}`);
}

// «Continuar con Google»: manda al usuario a Google
app.get('/api/oauth/google', (req, res) => {
  try {
    const estado = crypto.randomBytes(16).toString('hex');
    const url = logica.urlAccesoGoogle(estado);
    res.cookie(COOKIE_ESTADO, estado, { ...OPCIONES_COOKIE_ESTADO, maxAge: 10 * 60 * 1000 });
    res.redirect(url);
  } catch (error) {
    volverConErrorGoogle(res, error.message);
  }
});

// Google vuelve aquí. El JWT se pasa en el fragmento (#) de la URL: el navegador no lo envía
// al servidor ni queda en los registros, y acceso.html lo guarda como en un inicio de sesión normal
app.get('/api/oauth/google/retorno', async (req, res) => {
  const { code, state, error } = req.query;
  const esperado = leerCookie(req, COOKIE_ESTADO);
  res.clearCookie(COOKIE_ESTADO, OPCIONES_COOKIE_ESTADO);

  if (error) {
    return volverConErrorGoogle(res, error === 'access_denied'
      ? 'Has cancelado el acceso con Google'
      : 'Google no ha permitido el acceso');
  }
  if (!state || !esperado || state !== esperado) {
    return volverConErrorGoogle(res, 'La solicitud de acceso con Google ha caducado. Inténtalo de nuevo');
  }
  try {
    const sesion = await logica.entrarConGoogle(code);
    res.redirect(`/acceso.html#google=${encodeURIComponent(sesion.token)}`);
  } catch (err) {
    volverConErrorGoogle(res, err.message);
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

// --- SECTORES ---

// RF-17: sectores activos (público, sin sesión)
app.get('/api/sectores', async (req, res) => {
  try {
    res.json(await logica.listarSectores());
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// RF-22: todos los sectores, también los desactivados (solo administrador)
app.get('/api/sectores/todos', requerirAutenticacion, requerirRol('admin'), async (req, res) => {
  try {
    res.json(await logica.listarSectores({ incluirInactivos: true }));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// RF-22: crear un sector
app.post('/api/sectores', requerirAutenticacion, requerirRol('admin'), async (req, res) => {
  try {
    res.status(201).json(await logica.crearSector(req.body.nombre));
  } catch (error) {
    res.status(error.status || 400).json({ error: error.message });
  }
});

// RF-22: renombrar y/o activar o desactivar un sector. Cuerpo: { nombre?, activo? }
app.patch('/api/sectores/:id', requerirAutenticacion, requerirRol('admin'), async (req, res) => {
  const id = leerId(req, res);
  if (id === null) return;
  try {
    const { nombre, activo } = req.body;
    if (nombre === undefined && activo === undefined) {
      return res.status(400).json({ error: 'Indica el nombre nuevo o el estado activo' });
    }
    let sector;
    if (nombre !== undefined) sector = await logica.renombrarSector(id, nombre);
    if (activo !== undefined) sector = await logica.cambiarEstadoSector(id, activo);
    res.json(sector);
  } catch (error) {
    res.status(error.status || 400).json({ error: error.message });
  }
});

// --- PERFIL DEL PROFESIONAL ---
// No hay :id en la ruta: cada profesional solo ve y edita el suyo (RN-02)

app.get('/api/perfil', requerirAutenticacion, async (req, res) => {
  try {
    res.json(await logica.obtenerPerfil(req.usuario));
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message });
  }
});

app.put('/api/perfil', requerirAutenticacion, async (req, res) => {
  try {
    res.json(await logica.guardarPerfil(req.usuario, req.body));
  } catch (error) {
    // 409 (RN-03): se devuelven los servicios que se borrarían para que el cliente pida confirmación
    res.status(error.status || 400).json({ error: error.message, servicios: error.servicios });
  }
});

// --- SERVICIOS DEL PROFESIONAL (RF-14, RF-15) ---
// Los permisos (RN-02) y las reglas de precio (RN-06) los aplica la lógica

app.post('/api/perfil/servicios', requerirAutenticacion, async (req, res) => {
  try {
    res.status(201).json(await logica.crearServicio(req.usuario, req.body));
  } catch (error) {
    res.status(error.status || 400).json({ error: error.message });
  }
});

app.put('/api/perfil/servicios/:id', requerirAutenticacion, async (req, res) => {
  const id = leerId(req, res);
  if (id === null) return;
  try {
    res.json(await logica.editarServicio(req.usuario, id, req.body));
  } catch (error) {
    res.status(error.status || 400).json({ error: error.message });
  }
});

app.delete('/api/perfil/servicios/:id', requerirAutenticacion, async (req, res) => {
  const id = leerId(req, res);
  if (id === null) return;
  try {
    await logica.borrarServicio(req.usuario, id);
    res.json({ ok: true });
  } catch (error) {
    res.status(error.status || 400).json({ error: error.message });
  }
});

// --- LOGO Y FOTOS DE TRABAJOS (RF-23) ---
// El cuerpo de la petición es la imagen tal cual (Content-Type image/jpeg, image/png o image/webp)
const leerImagen = express.raw({ type: 'image/*', limit: '1mb' });

app.put('/api/perfil/logo', requerirAutenticacion, leerImagen, async (req, res) => {
  try {
    res.json(await logica.subirLogo(req.usuario, req.body));
  } catch (error) {
    res.status(error.status || 400).json({ error: error.message });
  }
});

app.delete('/api/perfil/logo', requerirAutenticacion, async (req, res) => {
  try {
    await logica.quitarLogo(req.usuario);
    res.json({ ok: true });
  } catch (error) {
    res.status(error.status || 400).json({ error: error.message });
  }
});

app.post('/api/perfil/fotos', requerirAutenticacion, leerImagen, async (req, res) => {
  try {
    res.status(201).json(await logica.subirFoto(req.usuario, req.body));
  } catch (error) {
    res.status(error.status || 400).json({ error: error.message });
  }
});

app.delete('/api/perfil/fotos/:id', requerirAutenticacion, async (req, res) => {
  const id = leerId(req, res);
  if (id === null) return;
  try {
    await logica.quitarFoto(req.usuario, id);
    res.json({ ok: true });
  } catch (error) {
    res.status(error.status || 400).json({ error: error.message });
  }
});

// Imagen pública (para la ficha); el id cambia si se sustituye, así que se puede guardar en caché
app.get('/api/imagenes/:id', async (req, res) => {
  const id = leerId(req, res);
  if (id === null) return;
  try {
    const imagen = await logica.obtenerImagen(id);
    res.set('Content-Type', imagen.mime);
    res.set('Cache-Control', 'public, max-age=86400');
    res.set('X-Content-Type-Options', 'nosniff');
    res.send(imagen.datos);
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message });
  }
});

// --- BUSCADOR Y FICHA PÚBLICA (RF-18 a RF-21) ---
// Públicas y de solo lectura: el visitante no tiene cuenta

// /api/profesionales?ciudad=ID&sector=ID&tipo=fijo&max=50&orden=precio-asc&pagina=1
app.get('/api/profesionales', async (req, res) => {
  try {
    res.json(await logica.buscarProfesionales(req.query));
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message });
  }
});

app.get('/api/profesionales/:id', async (req, res) => {
  const id = leerId(req, res);
  if (id === null) return;
  try {
    res.json(await logica.obtenerFichaPublica(id));
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message });
  }
});

// --- CIUDADES ---

// Autocompletado del catálogo de ciudades (público): /api/ciudades?q=texto
app.get('/api/ciudades', async (req, res) => {
  try {
    res.json(await logica.buscarCiudades(req.query.q));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Errores de Express antes de llegar a las rutas (cuerpo demasiado grande, JSON mal formado...)
app.use((error, req, res, next) => {
  if (error.type === 'entity.too.large') {
    return res.status(413).json({ error: 'El archivo es demasiado grande' });
  }
  if (error.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'El cuerpo de la petición no es válido' });
  }
  next(error);
});

app.listen(PORT, () => {
  console.log(`Servidor corriendo en http://localhost:${PORT}`);
});

module.exports = app;