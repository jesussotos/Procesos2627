const logica = require('../servidor/logica');
const datos = require('../servidor/datos');

describe('Pruebas unitarias de la capa de lógica (Hito 2)', () => {

  beforeEach(() => {
    datos.limpiar();
  });

  test('1. Debe registrar un usuario correctamente y no devolver la contraseña', () => {
    const usuario = logica.registrarUsuario('test@example.com', '123456');
    expect(usuario.email).toBe('test@example.com');
    expect(usuario.rol).toBe('usuario');
  });

  test('2. Debe iniciar sesión correctamente con credenciales válidas', () => {
    logica.registrarUsuario('login@example.com', '123456');
    const res = logica.iniciarSesion('login@example.com', '123456');
    expect(res.token).toBeDefined();
    expect(res.usuario.email).toBe('login@example.com');
  });

  test('3. Error: No debe iniciar sesión con contraseña incorrecta', () => {
    logica.registrarUsuario('login@example.com', '123456');
    expect(() => {
      logica.iniciarSesion('login@example.com', 'badpassword');
    }).toThrow('Credenciales incorrectas');
  });

  test('4. Error: No debe permitir registrar un email ya existente', () => {
    logica.registrarUsuario('test@example.com', '123456');
    expect(() => {
      logica.registrarUsuario('test@example.com', 'otraPassword');
    }).toThrow('El usuario ya existe');
  });

  test('5. Debe comprobar si un token es válido', () => {
    logica.registrarUsuario('jwt@example.com', '123456');
    const { token } = logica.iniciarSesion('jwt@example.com', '123456');
    const decoded = logica.verificarToken(token);
    expect(decoded.email).toBe('jwt@example.com');
  });

});