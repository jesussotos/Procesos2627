const logica = require('../servidor/logica');
const datos = require('../servidor/datos');

describe('Pruebas unitarias de la capa de lógica con BD (Hito 3)', () => {

  beforeEach(async () => {
    await datos.limpiar();
  });

  test('1. Debe registrar un usuario en la BD correctamente', async () => {
    const usuario = await logica.registrarUsuario('test3@example.com', '123456');
    expect(usuario.email).toBe('test3@example.com');
    expect(usuario.rol).toBe('usuario');
  });

  test('2. Debe iniciar sesión con credenciales válidas', async () => {
    await logica.registrarUsuario('login3@example.com', '123456');
    const res = await logica.iniciarSesion('login3@example.com', '123456');
    expect(res.token).toBeDefined();
    expect(res.usuario.email).toBe('login3@example.com');
  });

  test('3. Error: No debe permitir registrar un email ya existente', async () => {
    await logica.registrarUsuario('duplicado@example.com', '123456');
    await expect(
      logica.registrarUsuario('duplicado@example.com', 'otra')
    ).rejects.toThrow('El usuario ya existe');
  });

  test('4. Debe registrar un usuario con rol admin y verificar el token', async () => {
    await logica.registrarUsuario('admin@example.com', '123456', 'admin');
    const res = await logica.iniciarSesion('admin@example.com', '123456');
    const decoded = logica.verificarToken(res.token);
    expect(decoded.rol).toBe('admin');
  });

});