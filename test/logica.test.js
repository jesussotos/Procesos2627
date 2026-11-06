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

  // Registra, confirma e inicia sesión; devuelve el usuario tal como lo ve la API ({ id, email, rol })
  async function crearSesion(email, rol) {
    await registrarYConfirmar(email, '123456', rol);
    const { token } = await logica.iniciarSesion(email, '123456');
    return { token, usuario: await logica.comprobarSesion(token) };
  }

  test('1. Debe registrar un usuario pendiente y enviarle el correo de confirmación', async () => {
    const usuario = await logica.registrarUsuario('test3@example.com', '123456');
    expect(usuario.email).toBe('test3@example.com');
    expect(usuario.rol).toBe('profesional');
    expect(usuario.estado).toBe('pendiente');
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

  // --- Sprint 2: estado de usuario, eliminación y reactivación ---

  test('10. RF-08: Un usuario solo está activo tras confirmar su correo', async () => {
    await logica.registrarUsuario('estado@example.com', '123456');
    const { id } = await datos.buscarPorEmail('estado@example.com');
    expect((await logica.usuarioActivo(id)).activo).toBe(false);

    await logica.confirmarCuenta(correo.ultimoToken());
    const resultado = await logica.usuarioActivo(id);
    expect(resultado.activo).toBe(true);
    expect(resultado.estado).toBe('activo');
  });

  test('11. RF-08 Error: Comprobar un usuario que no existe', async () => {
    await expect(logica.usuarioActivo(9999)).rejects.toThrow('Usuario no encontrado');
  });

  test('12. RN-09: Un profesional puede eliminar su propia cuenta', async () => {
    const { usuario } = await crearSesion('yo@example.com');
    await logica.eliminarUsuario(usuario, usuario.id);
    const resultado = await logica.usuarioActivo(usuario.id);
    expect(resultado.estado).toBe('eliminado');
    expect(resultado.activo).toBe(false);
  });

  test('13. RN-09 Error: Un profesional no puede eliminar a otro', async () => {
    const { usuario: yo } = await crearSesion('yo@example.com');
    const { usuario: otro } = await crearSesion('otro@example.com');
    await expect(logica.eliminarUsuario(yo, otro.id)).rejects.toThrow('No tienes permiso');
    expect((await logica.usuarioActivo(otro.id)).activo).toBe(true);
  });

  test('14. RN-09: El administrador puede eliminar a un profesional', async () => {
    const { usuario: admin } = await crearSesion('jefe@example.com', 'admin');
    const { usuario: profesional } = await crearSesion('pro@example.com');
    await logica.eliminarUsuario(admin, profesional.id);
    expect((await logica.usuarioActivo(profesional.id)).estado).toBe('eliminado');
  });

  test('15. RN-09 Error: El administrador no puede eliminarse a sí mismo', async () => {
    const { usuario: admin } = await crearSesion('jefe@example.com', 'admin');
    await expect(logica.eliminarUsuario(admin, admin.id)).rejects.toThrow('propia cuenta');
  });

  test('16. RN-08 Error: Un usuario eliminado no puede iniciar sesión', async () => {
    const { usuario } = await crearSesion('baja@example.com');
    await logica.eliminarUsuario(usuario, usuario.id);
    await expect(
      logica.iniciarSesion('baja@example.com', '123456')
    ).rejects.toThrow('Credenciales incorrectas');
  });

  test('17. RN-08 Error: La sesión abierta de un usuario eliminado deja de valer', async () => {
    const { token, usuario } = await crearSesion('baja@example.com');
    await logica.eliminarUsuario(usuario, usuario.id);
    await expect(logica.comprobarSesion(token)).rejects.toThrow('La sesión ya no es válida');
  });

  test('18. RN-11: Una cuenta eliminada se puede registrar otra vez con el mismo correo', async () => {
    const { usuario } = await crearSesion('vuelve@example.com');
    await logica.eliminarUsuario(usuario, usuario.id);

    const reactivado = await logica.registrarUsuario('vuelve@example.com', 'nueva123');
    expect(reactivado.estado).toBe('pendiente');
    await logica.confirmarCuenta(correo.ultimoToken());

    // Es la misma cuenta (mismo id), con la contraseña nueva; la antigua ya no vale
    const res = await logica.iniciarSesion('vuelve@example.com', 'nueva123');
    expect(res.usuario.id).toBe(usuario.id);
    await expect(
      logica.iniciarSesion('vuelve@example.com', '123456')
    ).rejects.toThrow('Credenciales incorrectas');
  });

  test('19. El listado del administrador muestra email, rol y estado', async () => {
    await crearSesion('activo@example.com');
    await logica.registrarUsuario('pendiente@example.com', '123456');
    const lista = await logica.listarUsuarios();
    expect(lista).toEqual(expect.arrayContaining([
      expect.objectContaining({ email: 'activo@example.com', rol: 'profesional', estado: 'activo' }),
      expect.objectContaining({ email: 'pendiente@example.com', rol: 'profesional', estado: 'pendiente' })
    ]));
    expect(lista[0].password).toBeUndefined();
  });

  // --- Sprint 2: catálogos de sectores y ciudades ---

  test('20. RF-22: El administrador crea un sector y aparece entre los activos', async () => {
    const sector = await logica.crearSector('  Fontanería  ');
    expect(sector.nombre).toBe('Fontanería');
    const activos = await logica.listarSectores();
    expect(activos.map(s => s.nombre)).toContain('Fontanería');
  });

  test('21. RN-05 Error: No se puede crear "fontaneria" si existe "Fontanería"', async () => {
    await logica.crearSector('Fontanería');
    await expect(logica.crearSector('fontaneria')).rejects.toThrow('Ya existe un sector con ese nombre');
    await expect(logica.crearSector('FONTANERÍA')).rejects.toThrow('Ya existe un sector con ese nombre');
  });

  test('22. RN-05 Error: No se puede renombrar un sector con el nombre de otro', async () => {
    await logica.crearSector('Pintura');
    const otro = await logica.crearSector('Electricidad');
    await expect(logica.renombrarSector(otro.id, 'pintura')).rejects.toThrow('Ya existe un sector con ese nombre');
  });

  test('23. RF-22: Renombrar un sector (también cambiando solo tildes o mayúsculas)', async () => {
    const sector = await logica.crearSector('Informatica');
    const renombrado = await logica.renombrarSector(sector.id, 'Informática');
    expect(renombrado.nombre).toBe('Informática');
    expect((await logica.listarSectores()).map(s => s.nombre)).toEqual(['Informática']);
  });

  test('24. RN-04: Un sector desactivado deja de listarse, pero no se borra', async () => {
    const sector = await logica.crearSector('Mudanzas');
    await logica.cambiarEstadoSector(sector.id, false);
    expect(await logica.listarSectores()).toHaveLength(0);
    const todos = await logica.listarSectores({ incluirInactivos: true });
    expect(todos).toEqual([expect.objectContaining({ nombre: 'Mudanzas', activo: false })]);

    await logica.cambiarEstadoSector(sector.id, true);
    expect(await logica.listarSectores()).toHaveLength(1);
  });

  test('25. RF-22 Error: Nombre de sector vacío o demasiado largo', async () => {
    await expect(logica.crearSector('   ')).rejects.toThrow('obligatorio');
    await expect(logica.crearSector('x'.repeat(51))).rejects.toThrow('50 caracteres');
  });

  test('26. RF-22 Error: Modificar un sector que no existe', async () => {
    await expect(logica.renombrarSector(9999, 'Nuevo')).rejects.toThrow('Sector no encontrado');
    await expect(logica.cambiarEstadoSector(9999, false)).rejects.toThrow('Sector no encontrado');
  });

  test('27. Ciudades: la búsqueda no distingue tildes y muestra la provincia', async () => {
    const resultado = await logica.buscarCiudades('caceres');
    expect(resultado).toEqual([expect.objectContaining({ nombre: 'Cáceres', provincia: 'Cáceres' })]);
  });

  test('28. Ciudades: primero las que empiezan por el texto y como máximo 10', async () => {
    const resultado = await logica.buscarCiudades('san');
    expect(resultado.length).toBeLessThanOrEqual(10);
    expect(resultado[0].nombre.toLowerCase().startsWith('san')).toBe(true);
    expect(await logica.buscarCiudades('a')).toEqual([]);
  });
});
