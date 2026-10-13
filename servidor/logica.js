const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const datos = require('./datos');
require('dotenv').config();

const JWT_SECRET = process.env.JWT_SECRET || 'secreto_por_defecto_desarrollo';

const logica = {
  // Registro asíncrono
  registrarUsuario: async (email, password, rol = 'usuario') => {
    const existe = await datos.buscarPorEmail(email);
    if (existe) {
      throw new Error('El usuario ya existe');
    }

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    const nuevoUsuario = {
      email,
      password: passwordHash,
      rol,
      confirmado: false
    };

    const usuarioGuardado = await datos.guardar(nuevoUsuario);
    return { email: usuarioGuardado.email, rol: usuarioGuardado.rol };
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