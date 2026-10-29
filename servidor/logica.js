const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const datos = require('./datos');
require('dotenv').config();

const JWT_SECRET = process.env.JWT_SECRET || 'secreto_por_defecto_desarrollo';

const crearLogica = ({
  datosRepositorio = datos,
  servicioCorreo = null,
  ahora = () => Date.now(),
  appPublicUrl = process.env.APP_PUBLIC_URL || 'http://localhost:3000'
} = {}) => {
  const logica = {
  // Registro asíncrono
  registrarUsuario: async (email, password, rol = 'usuario') => {
    const existe = await datosRepositorio.buscarPorEmail(email);
    if (existe) {
      throw new Error('El usuario ya existe');
    }

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);
    const token = crypto.randomBytes(32).toString('hex');
    const confirmationTokenHash = crypto
      .createHash('sha256')
      .update(token)
      .digest('hex');
    const confirmationExpiresAt = ahora() + (24 * 60 * 60 * 1000);

    const nuevoUsuario = {
      email,
      password: passwordHash,
      rol,
      confirmado: false,
      confirmationTokenHash,
      confirmationExpiresAt
    };

    const usuarioGuardado = await datosRepositorio.guardar(nuevoUsuario);
    try {
      if (servicioCorreo) {
        const enlace = `${appPublicUrl.replace(/\/$/, '')}/api/usuarios/confirmar?token=${encodeURIComponent(token)}`;
        await servicioCorreo.enviarConfirmacion({ destinatario: email, enlace });
      }
    } catch (error) {
      await datosRepositorio.eliminarPorEmail(email);
      throw error;
    }
    return { email: usuarioGuardado.email, rol: usuarioGuardado.rol };
  },

  // Inicio de sesión asíncrono
  iniciarSesion: async (email, password) => {
    const usuario = await datosRepositorio.buscarPorEmail(email);
    if (!usuario) {
      throw new Error('Credenciales incorrectas');
    }
    if (!usuario.confirmado) {
      throw new Error('La cuenta no está confirmada');
    }

    const passwordValida = await bcrypt.compare(password, usuario.password);
    if (!passwordValida) {
      throw new Error('Credenciales incorrectas');
    }

    // Incluimos el rol en el token JWT
    const token = jwt.sign(
      { id: usuario.id, email: usuario.email, rol: usuario.rol },
      JWT_SECRET,
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
      return jwt.verify(token, JWT_SECRET);
    } catch (error) {
      throw new Error('Token inválido o expirado');
    }
  },

  // Listar usuarios (solo accesible por Administradores)
  listarUsuarios: async () => {
    return await datosRepositorio.obtenerTodos();
  },

  confirmarCuenta: async (token) => {
    if (typeof token !== 'string' || token.length === 0) {
      throw new Error('Token de confirmación no válido');
    }
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const confirmada = await datosRepositorio.consumirConfirmacion(tokenHash, ahora());
    if (!confirmada) {
      throw new Error('Token de confirmación no válido o caducado');
    }
    return { confirmado: true };
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

      const existe = await datosRepositorio.buscarPorEmail(emailAdmin);

      if (!existe) {
        const salt = await bcrypt.genSalt(10);
        const passwordHash = await bcrypt.hash(passwordEnTextoPlano, salt);

        await datosRepositorio.guardar({
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
  return logica;
};

const logica = crearLogica();
logica.inicializarAdminPorDefecto();

logica.crearLogica = crearLogica;
module.exports = logica;