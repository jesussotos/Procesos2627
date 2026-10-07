const datos = require('./datos');

module.exports = {
  registrarUsuario: (email, password) => {
    if (!email || !password) throw new Error('Datos incompletos');
    if (datos.buscarPorEmail(email)) throw new Error('El usuario ya existe');

    const nuevoUsuario = {
      email,
      password,
      rol: 'usuario',
      confirmado: false
    };
    return datos.guardar(nuevoUsuario);
  },

  listarUsuarios: () => datos.obtenerTodos(),

  estaActivo: (email) => {
    const usuario = datos.buscarPorEmail(email);
    if (!usuario) return false;
    return usuario.confirmado === true; // En el Hito 1, activo si ha confirmado su cuenta
  },

  eliminarUsuario: (email) => {
    if (!datos.buscarPorEmail(email)) throw new Error('Usuario no encontrado');
    return datos.eliminarPorEmail(email);
  }
};