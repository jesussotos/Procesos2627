const logicaModulo = require('../servidor/logica');
const datos = require('../servidor/datos');

let ahora;
const envios = [];
const servicioCorreo = {
  enviarConfirmacion: async (datosCorreo) => {
    envios.push(datosCorreo);
  }
};
const logica = logicaModulo.crearLogica({
  datosRepositorio: datos,
  servicioCorreo,
  ahora: () => ahora,
  appPublicUrl: 'http://localhost:3000'
});

const confirmarUltimoUsuario = async () => {
  const url = new URL(envios.at(-1).enlace);
  return logica.confirmarCuenta(url.searchParams.get('token'));
};

describe('Pruebas unitarias de la capa de lógica con BD (Hito 3)', () => {

  beforeEach(async () => {
    await datos.limpiar();
    envios.length = 0;
    ahora = Date.now();
  });

  test('1. Debe registrar un usuario en la BD correctamente', async () => {
    const usuario = await logica.registrarUsuario('test3@uclm.es', '123456');
    expect(usuario.email).toBe('test3@uclm.es');
    expect(usuario.rol).toBe('usuario');
  });

  test('2. Debe iniciar sesión con credenciales válidas', async () => {
    await logica.registrarUsuario('login3@uclm.es', '123456');
    await confirmarUltimoUsuario();
    const res = await logica.iniciarSesion('login3@uclm.es', '123456');
    expect(res.token).toBeDefined();
    expect(res.usuario.email).toBe('login3@uclm.es');
  });

  test('3. Error: No debe permitir registrar un email ya existente', async () => {
    await logica.registrarUsuario('duplicado@uclm.es', '123456');
    await expect(
      logica.registrarUsuario('duplicado@uclm.es', 'otra')
    ).rejects.toThrow('El usuario ya existe');
  });

  test('4. Debe registrar un usuario con rol admin y verificar el token', async () => {
    await logica.registrarUsuario('admin@uclm.es', '123456', 'admin');
    await confirmarUltimoUsuario();
    const res = await logica.iniciarSesion('admin@uclm.es', '123456');
    const decoded = logica.verificarToken(res.token);
    expect(decoded.rol).toBe('admin');
  });

});

describe('Confirmación de cuenta por correo', () => {
  beforeEach(async () => {
    await datos.limpiar();
    envios.length = 0;
    ahora = Date.now();
  });

  test('envía un enlace de confirmación sin llamar a un proveedor real', async () => {
    await logica.registrarUsuario('correo@uclm.es', '123456');
    expect(envios).toHaveLength(1);
    expect(envios[0].destinatario).toBe('correo@uclm.es');
    expect(envios[0].enlace).toContain('/api/usuarios/confirmar?token=');
  });

  test('confirma una cuenta y consume el token una sola vez', async () => {
    await logica.registrarUsuario('confirmado@uclm.es', '123456');
    await confirmarUltimoUsuario();
    await expect(confirmarUltimoUsuario())
      .rejects.toThrow('Token de confirmación no válido o caducado');
    await expect(logica.iniciarSesion('confirmado@uclm.es', '123456'))
      .resolves.toHaveProperty('usuario.email', 'confirmado@uclm.es');
  });

  test('rechaza un token caducado', async () => {
    await logica.registrarUsuario('caducado@uclm.es', '123456');
    ahora += 24 * 60 * 60 * 1000;
    await expect(confirmarUltimoUsuario())
      .rejects.toThrow('Token de confirmación no válido o caducado');
  });

  test('rechaza un token desconocido', async () => {
    await expect(logica.confirmarCuenta('token-inexistente'))
      .rejects.toThrow('Token de confirmación no válido o caducado');
  });
});

describe('Registro sin restricción de dominio', () => {
  test('permite registrar un email de cualquier dominio', async () => {
    const usuario = await logica.registrarUsuario('persona@gmail.com', '123456');
    expect(usuario.email).toBe('persona@gmail.com');
  });
});