// La lógica exige JWT_SECRET (RNF-02). En el CI no hay .env, así que las pruebas usan uno propio.
process.env.JWT_SECRET = process.env.JWT_SECRET || 'secreto-solo-para-pruebas';

const logica = require('../servidor/logica');
const datos = require('../servidor/datos');

// Adaptador de correo falso: no envía nada, guarda los tokens para poder confirmar
function crearCorreoFalso() {
  const enviados = [];
  return {
    enviados,
    enviarConfirmacion: async (email, token) => {
      enviados.push({ email, token });
    },
    ultimoToken: () => enviados[enviados.length - 1].token
  };
}

describe('Pruebas unitarias de la capa de lógica', () => {
  let correo;

  beforeEach(async () => {
    await datos.limpiar();
    correo = crearCorreoFalso();
    logica.configurarCorreo(correo);
  });

  // Registra y confirma, como haría el usuario al pulsar el enlace del correo
  async function registrarYConfirmar(email, password, rol) {
    await logica.registrarUsuario(email, password, rol);
    await logica.confirmarCuenta(correo.ultimoToken());
  }

  test('1. Debe registrar un usuario pendiente y enviarle el correo de confirmación', async () => {
    const usuario = await logica.registrarUsuario('test3@example.com', '123456');
    expect(usuario.email).toBe('test3@example.com');
    expect(usuario.rol).toBe('usuario');
    expect(usuario.confirmado).toBe(false);
    expect(correo.enviados).toHaveLength(1);
    expect(correo.enviados[0].email).toBe('test3@example.com');
  });

  test('2. Debe iniciar sesión con credenciales válidas tras confirmar', async () => {
    await registrarYConfirmar('login3@example.com', '123456');
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
    await registrarYConfirmar('admin@example.com', '123456', 'admin');
    const res = await logica.iniciarSesion('admin@example.com', '123456');
    const decoded = logica.verificarToken(res.token);
    expect(decoded.rol).toBe('admin');
  });

  test('5. Error: Una cuenta pendiente de confirmar no puede iniciar sesión', async () => {
    await logica.registrarUsuario('pendiente@example.com', '123456');
    await expect(
      logica.iniciarSesion('pendiente@example.com', '123456')
    ).rejects.toThrow('Debes confirmar tu correo antes de iniciar sesión');
  });

  test('6. Error: Un token de confirmación inventado no confirma nada', async () => {
    await expect(
      logica.confirmarCuenta('token-que-no-existe')
    ).rejects.toThrow('no es válido');
  });

  test('7. Error: El enlace de confirmación no se puede usar dos veces', async () => {
    await logica.registrarUsuario('doble@example.com', '123456');
    const token = correo.ultimoToken();
    await logica.confirmarCuenta(token);
    await expect(logica.confirmarCuenta(token)).rejects.toThrow('no es válido');
  });

  test('8. Error: Si el correo no se puede enviar, el alta se deshace', async () => {
    logica.configurarCorreo({
      enviarConfirmacion: async () => { throw new Error('Brevo caído'); }
    });
    await expect(
      logica.registrarUsuario('sincorreo@example.com', '123456')
    ).rejects.toThrow('No se pudo enviar el correo de confirmación');
    expect(await datos.buscarPorEmail('sincorreo@example.com')).toBeNull();
  });

  test('9. Error: Sin JWT_SECRET no se emiten tokens (no hay secreto de respaldo)', async () => {
    await registrarYConfirmar('sinsecreto@example.com', '123456');
    const secreto = process.env.JWT_SECRET;
    delete process.env.JWT_SECRET;
    try {
      await expect(
        logica.iniciarSesion('sinsecreto@example.com', '123456')
      ).rejects.toThrow('Falta JWT_SECRET');
    } finally {
      process.env.JWT_SECRET = secreto;
    }
  });
});
