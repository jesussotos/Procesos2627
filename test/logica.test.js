const logica = require('../servidor/logica');
const datos = require('../servidor/datos');

describe('Pruebas unitarias de la capa de lógica (Hito 1)', () => {

  // Limpiamos los datos en memoria antes de cada test
  beforeEach(() => {
    datos.limpiar();
  });

  test('1. Debe registrar un usuario correctamente', () => {
    const usuario = logica.registrarUsuario('test@example.com', '123456');
    expect(usuario.email).toBe('test@example.com');
    expect(usuario.confirmado).toBe(false);
  });

  test('2. Error: No debe permitir registrar un email ya existente', () => {
    logica.registrarUsuario('test@example.com', '123456');
    expect(() => {
      logica.registrarUsuario('test@example.com', 'otraPassword');
    }).toThrow('El usuario ya existe');
  });

  test('3. Debe listar los usuarios registrados', () => {
    logica.registrarUsuario('user1@example.com', '123456');
    logica.registrarUsuario('user2@example.com', '123456');
    const lista = logica.listarUsuarios();
    expect(lista.length).toBe(2);
  });

  test('4. Debe comprobar si un usuario está activo (confirmado)', () => {
    logica.registrarUsuario('user@example.com', '123456');
    expect(logica.estaActivo('user@example.com')).toBe(false);
    
    // Si confirmamos la cuenta
    const usuario = datos.buscarPorEmail('user@example.com');
    usuario.confirmado = true;
    expect(logica.estaActivo('user@example.com')).toBe(true);
  });

  test('5. Debe eliminar un usuario existente', () => {
    logica.registrarUsuario('delete@example.com', '123456');
    const resultado = logica.eliminarUsuario('delete@example.com');
    expect(resultado).toBe(true);
    expect(logica.listarUsuarios().length).toBe(0);
  });

  test('6. Error: Debe lanzar un error si se intenta eliminar un usuario inexistente', () => {
    expect(() => {
      logica.eliminarUsuario('noexiste@example.com');
    }).toThrow('Usuario no encontrado');
  });

});