const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const datos = require('./datos');
require('dotenv').config();

// RNF-02: el secreto JWT solo puede venir del entorno (.env en local, Secret Manager en Cloud Run).
// No hay valor de respaldo: sin JWT_SECRET no se emite ni se verifica ningún token.
function secretoJwt() {
  const secreto = process.env.JWT_SECRET;
  if (!secreto) {
    throw new Error('Falta JWT_SECRET en las variables de entorno');
  }
  return secreto;
}
const VALIDEZ_TOKEN_CONFIRMACION_MS = 24 * 60 * 60 * 1000; // 24 horas

// Adaptador de correo inyectado desde la composición (api.js) o desde las pruebas.
// Debe ofrecer: enviarConfirmacion(email, token)
let correo = null;

const logica = {
  configurarCorreo: (adaptador) => {
    correo = adaptador;
  },

  // Registro asíncrono: la cuenta queda pendiente hasta confirmar el correo
  registrarUsuario: async (email, password, rol = 'usuario') => {
    if (!correo) {
      throw new Error('El servicio de correo no está configurado');
    }

    const existe = await datos.buscarPorEmail(email);
    if (existe) {
      throw new Error('El usuario ya existe');
    }

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);
    const tokenConfirmacion = crypto.randomBytes(32).toString('hex');

    const nuevoUsuario = {
      email,
      password: passwordHash,
      rol,
      confirmado: false,
      tokenConfirmacion,
      tokenExpira: Date.now() + VALIDEZ_TOKEN_CONFIRMACION_MS
    };

    const usuarioGuardado = await datos.guardar(nuevoUsuario);

    try {
      await correo.enviarConfirmacion(email, tokenConfirmacion);
    } catch (error) {
      // Si el correo no sale, deshacemos el alta para que el usuario pueda volver a registrarse
      await datos.eliminarPorEmail(email);
      console.error(`[registro] Error enviando confirmación a ${email}:`, error.message);
      throw new Error('No se pudo enviar el correo de confirmación. Inténtalo de nuevo más tarde');
    }

    console.log(`[registro] Usuario ${email} registrado, pendiente de confirmar`);
    return { email: usuarioGuardado.email, rol: usuarioGuardado.rol, confirmado: false };
  },

  // Confirmación de cuenta a partir del token recibido por correo
  confirmarCuenta: async (token) => {
    if (!token) {
      throw new Error('Falta el token de confirmación');
    }

    const usuario = await datos.buscarPorTokenConfirmacion(token);
    if (!usuario) {
      throw new Error('El enlace de confirmación no es válido o ya se ha usado');
    }
    if (usuario.token_expira && usuario.token_expira < Date.now()) {
      throw new Error('El enlace de confirmación ha caducado');
    }

    await datos.confirmar(usuario.id);
    console.log(`[confirmacion] Cuenta ${usuario.email} confirmada`);
    return { email: usuario.email };
  },

  // Inicio de sesión asíncrono
  iniciarSesion: async (email, password) => {
    const usuario = await datos.buscarPorEmail(email);
    if (!usuario) {
      throw new Error('Credenciales incorrectas');
    }

    const passwordValida = await bcrypt.compare(password, usuario.password);
    if (!passwordValida) {
      throw new Error('Credenciales incorrectas');
    }

    // Se comprueba después de la contraseña para no revelar qué cuentas existen
    if (!usuario.confirmado) {
      throw new Error('Debes confirmar tu correo antes de iniciar sesión');
    }

    // Incluimos el rol en el token JWT
    const token = jwt.sign(
      { id: usuario.id, email: usuario.email, rol: usuario.rol },
      secretoJwt(),
      { expiresIn: '2h' }
    );

    return {
      token,
      usuario: { email: usuario.email, rol: usuario.rol }
    };
  },

  // Verificación de token JWT
  verificarToken: (token) => {
    try {
      return jwt.verify(token, secretoJwt());
    } catch (error) {
      throw new Error('Token inválido o expirado');
    }
  },

  // Listar usuarios (solo accesible por Administradores)
  listarUsuarios: async () => {
    return await datos.obtenerTodos();
  },

  // Creación automática del admin usando variables de entorno para mayor seguridad
  inicializarAdminPorDefecto: async () => {
    try {
      // 1. Tu correo de administrador (puedes cambiarlo aquí)
      const emailAdmin = 'admin@admin.com'; 
      
      // 2. La contraseña se lee de forma segura del sistema (Cloud Run / .env)
      const passwordEnTextoPlano = process.env.ADMIN_PASSWORD;

      if (!passwordEnTextoPlano) {
        return; // Si no hay contraseña configurada en el entorno, no hace nada
      }

      const existe = await datos.buscarPorEmail(emailAdmin);

      if (!existe) {
        const salt = await bcrypt.genSalt(10);
        const passwordHash = await bcrypt.hash(passwordEnTextoPlano, salt);

        await datos.guardar({
          email: emailAdmin,
          password: passwordHash,
          rol: 'admin',
          confirmado: true
        });
        console.log('✅ Usuario administrador creado de forma segura.');
      }
    } catch (error) {
      console.error('Error al inicializar el administrador:', error.message);
    }
  }
};

// Se ejecuta al arrancar el servidor
logica.inicializarAdminPorDefecto();

module.exports = logica;
