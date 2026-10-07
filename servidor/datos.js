const usuarios = [];

module.exports = {
  guardar: (usuario) => { usuarios.push(usuario); return usuario; },
  obtenerTodos: () => usuarios,
  buscarPorEmail: (email) => usuarios.find(u => u.email === email),
  eliminarPorEmail: (email) => {
    const index = usuarios.findIndex(u => u.email === email);
    if (index !== -1) {
      usuarios.splice(index, 1);
      return true;
    }
    return false;
  },
  limpiar: () => { usuarios.length = 0; } // Útil para resetear en los tests
};