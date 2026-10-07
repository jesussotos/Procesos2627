const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const datos = require('./datos');

const SECRET_KEY = process.env.JWT_SECRET || 'secreto_super_seguro_desarrollo';

module.exports = {
  registrarUsuario: (email, password) => {
    if (!email || !password) throw new Error('Datos incompletos');
    if (datos.buscarPorEmail(email)) throw new Error('El usuario ya existe');

    // Hash de contraseña seguro (apartado 5)
    const passwordHash = bcrypt.hashSync(password, 10);

    const nuevoUsuario = {
      email,
      password: passwordHash,
      rol: 'usuario',
      confirmado: false
    };
    datos.guardar(nuevoUsuario);
    return { email: nuevoUsuario.email, rol: nuevoUsuario.rol };
  },

  iniciarSesion: (email, password) => {
    const usuario = datos.buscarPorEmail(email);
    if (!usuario) throw new Error('Credenciales incorrectas');

    const passwordValida = bcrypt.compareSync(password, usuario.password);
    if (!passwordValida) throw new Error('Credenciales incorrectas');

    // Generar Token de sesión
    const token = jwt.sign(
      { email: usuario.email, rol: usuario.rol },
      SECRET_KEY,
      { expiresIn: '2h' }
    );

    return { token, usuario: { email: usuario.email, rol: usuario.rol } };
  },

  verificarToken: (token) => {
    try {
      return jwt.verify(token, SECRET_KEY);
    } catch (e) {
      throw new Error('Sesión no válida o expirada');
    }
  },

  listarUsuarios: () => datos.obtenerTodos().map(u => ({ email: u.email, rol: u.rol, confirmado: u.confirmado })),

  estaActivo: (email) => {
    const usuario = datos.buscarPorEmail(email);
    if (!usuario) return false;
    return usuario.confirmado === true;
  },

  eliminarUsuario: (email) => {
    if (!datos.buscarPorEmail(email)) throw new Error('Usuario no encontrado');
    return datos.eliminarPorEmail(email);
  }
};