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

// Adaptador de Google falso (RF-04): solo acepta 'codigo-valido' y devuelve la identidad indicada
function crearGoogleFalso(identidad) {
  return {
    urlAutorizacion: (estado) => `https://google.test/auth?state=${estado}`,
    obtenerIdentidad: async (codigo) => {
      if (codigo !== 'codigo-valido') throw new Error('invalid_grant');
      return identidad;
    }
  };
}

describe('Pruebas unitarias de la capa de lógica', () => {
  let correo;

  beforeEach(async () => {
    await datos.limpiar();
    correo = crearCorreoFalso();
    logica.configurarCorreo(correo);
    logica.configurarGoogle(null);
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

  // --- Sprint 2: perfil del profesional ---

  async function idCiudad(nombre) {
    const [ciudad] = await logica.buscarCiudades(nombre);
    return ciudad.id;
  }

  // Perfil mínimo válido para un profesional, al que cada prueba cambia lo que necesite
  async function perfilBase() {
    // Se reutiliza el sector si otra parte de la prueba ya lo creó (RN-05 impide duplicarlo)
    const fontaneria = (await logica.listarSectores()).find(s => s.nombre === 'Fontanería')
      || await logica.crearSector('Fontanería');
    return {
      nombreComercial: 'Fontanería Pérez',
      descripcion: 'Reparaciones urgentes.\nPresupuesto sin compromiso.',
      telefono: '+34 600 111 222',
      sectores: [{ sectorId: fontaneria.id, especialidad: 'Calderas y calentadores' }],
      ciudades: [await idCiudad('cáceres')]
    };
  }

  test('29. RF-11/12/13: Un profesional crea su perfil y lo consulta', async () => {
    const { usuario } = await crearSesion('pro@example.com');
    expect((await logica.obtenerPerfil(usuario)).existe).toBe(false);

    const entrada = await perfilBase();
    entrada.web = 'fontaneriaperez.es';
    const perfil = await logica.guardarPerfil(usuario, entrada);

    expect(perfil.existe).toBe(true);
    expect(perfil.nombreComercial).toBe('Fontanería Pérez');
    expect(perfil.descripcion).toBe('Reparaciones urgentes.\nPresupuesto sin compromiso.');
    expect(perfil.web).toBe('https://fontaneriaperez.es');
    expect(perfil.sectores).toEqual([expect.objectContaining({ nombre: 'Fontanería', especialidad: 'Calderas y calentadores' })]);
    expect(perfil.ciudades).toEqual([expect.objectContaining({ nombre: 'Cáceres', provincia: 'Cáceres' })]);
  });

  test('30. RF-12/13: Editar el perfil sustituye sus sectores y ciudades', async () => {
    const { usuario } = await crearSesion('pro@example.com');
    const entrada = await perfilBase();
    await logica.guardarPerfil(usuario, entrada);

    const pintura = await logica.crearSector('Pintura');
    entrada.sectores = [{ sectorId: pintura.id, especialidad: 'Interiores' }];
    entrada.ciudades = [await idCiudad('vigo'), await idCiudad('lugo')];
    const perfil = await logica.guardarPerfil(usuario, entrada);

    expect(perfil.sectores.map(s => s.nombre)).toEqual(['Pintura']);
    expect(perfil.ciudades.map(c => c.nombre)).toEqual(['Lugo', 'Vigo']);
  });

  test('31. RN-04 Error: No se puede elegir un sector desactivado', async () => {
    const { usuario } = await crearSesion('pro@example.com');
    const entrada = await perfilBase();
    const mudanzas = await logica.crearSector('Mudanzas');
    await logica.cambiarEstadoSector(mudanzas.id, false);
    entrada.sectores.push({ sectorId: mudanzas.id, especialidad: 'Pisos' });
    await expect(logica.guardarPerfil(usuario, entrada)).rejects.toThrow('no está disponible');
  });

  test('32. RN-04: Un sector que ya tenías y se desactiva se puede conservar al editar', async () => {
    const { usuario } = await crearSesion('pro@example.com');
    const entrada = await perfilBase();
    await logica.guardarPerfil(usuario, entrada);
    await logica.cambiarEstadoSector(entrada.sectores[0].sectorId, false);

    entrada.nombreComercial = 'Fontanería Pérez e Hijos';
    const perfil = await logica.guardarPerfil(usuario, entrada);
    expect(perfil.sectores).toEqual([expect.objectContaining({ nombre: 'Fontanería', activo: false })]);
  });

  test('33. RN-07 Error: Ciudad que no está en el catálogo o repetida', async () => {
    const { usuario } = await crearSesion('pro@example.com');
    const entrada = await perfilBase();
    entrada.ciudades = [999999];
    await expect(logica.guardarPerfil(usuario, entrada)).rejects.toThrow('no existe en el catálogo');
    const madrid = await idCiudad('madrid');
    entrada.ciudades = [madrid, madrid];
    await expect(logica.guardarPerfil(usuario, entrada)).rejects.toThrow('misma ciudad dos veces');
  });

  test('34. RN-10 Error: Textos más largos de lo permitido', async () => {
    const { usuario } = await crearSesion('pro@example.com');
    const entrada = await perfilBase();
    await expect(logica.guardarPerfil(usuario, { ...entrada, nombreComercial: 'x'.repeat(81) })).rejects.toThrow('80 caracteres');
    await expect(logica.guardarPerfil(usuario, { ...entrada, descripcion: 'x'.repeat(1001) })).rejects.toThrow('1000 caracteres');
    entrada.sectores[0].especialidad = 'x'.repeat(151);
    await expect(logica.guardarPerfil(usuario, entrada)).rejects.toThrow('150 caracteres');
  });

  test('35. RF-11/12 Error: Faltan el nombre comercial o la especialidad', async () => {
    const { usuario } = await crearSesion('pro@example.com');
    const entrada = await perfilBase();
    await expect(logica.guardarPerfil(usuario, { ...entrada, nombreComercial: '   ' })).rejects.toThrow('nombre comercial es obligatorio');
    entrada.sectores[0].especialidad = '';
    await expect(logica.guardarPerfil(usuario, entrada)).rejects.toThrow('especialidad de Fontanería es obligatorio');
  });

  test('36. RF-11 Error: Hace falta al menos un dato de contacto válido', async () => {
    const { usuario } = await crearSesion('pro@example.com');
    const entrada = await perfilBase();
    delete entrada.telefono;
    await expect(logica.guardarPerfil(usuario, entrada)).rejects.toThrow('al menos un dato de contacto');
    await expect(logica.guardarPerfil(usuario, { ...entrada, emailContacto: 'no-es-un-email' })).rejects.toThrow('formato válido');
    await expect(logica.guardarPerfil(usuario, { ...entrada, telefono: '600-abc' })).rejects.toThrow('solo puede tener números');
  });

  test('37. RN-02: Cada profesional solo ve y edita su propio perfil; el admin no tiene perfil', async () => {
    const { usuario: ana } = await crearSesion('ana@example.com');
    const { usuario: luis } = await crearSesion('luis@example.com');
    const { usuario: admin } = await crearSesion('jefe@example.com', 'admin');
    await logica.guardarPerfil(ana, await perfilBase());

    expect((await logica.obtenerPerfil(luis)).existe).toBe(false);
    await expect(logica.obtenerPerfil(admin)).rejects.toThrow('Solo los profesionales tienen perfil');
  });

  test('38. D-17: Al reactivar una cuenta eliminada, el perfil anterior se descarta', async () => {
    const { usuario } = await crearSesion('vuelve@example.com');
    await logica.guardarPerfil(usuario, await perfilBase());
    await logica.eliminarUsuario(usuario, usuario.id);

    await logica.registrarUsuario('vuelve@example.com', 'nueva123');
    await logica.confirmarCuenta(correo.ultimoToken());
    expect((await logica.obtenerPerfil(usuario)).existe).toBe(false);
  });

  // --- Sprint 2: logo y fotos de trabajos (RF-23) ---

  // Bastan los primeros bytes de cada formato: el servidor no decodifica la imagen
  const JPG = (bytes = 200) => Buffer.concat([Buffer.from([0xFF, 0xD8, 0xFF, 0xE0]), Buffer.alloc(bytes)]);
  const PNG = () => Buffer.concat([Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]), Buffer.alloc(200)]);

  test('39. RF-23: El profesional sube su logo y aparece en su perfil; uno nuevo sustituye al anterior', async () => {
    const { usuario } = await crearSesion('pro@example.com');
    const primero = await logica.subirLogo(usuario, PNG());
    const segundo = await logica.subirLogo(usuario, JPG());
    const perfil = await logica.obtenerPerfil(usuario);
    expect(perfil.logo).toEqual({ id: segundo.id, url: `/api/imagenes/${segundo.id}` });
    await expect(logica.obtenerImagen(primero.id)).rejects.toThrow('Imagen no encontrada');
    expect((await logica.obtenerImagen(segundo.id)).mime).toBe('image/jpeg');

    await logica.quitarLogo(usuario);
    expect((await logica.obtenerPerfil(usuario)).logo).toBeNull();
  });

  test('40. RF-23: Fotos de trabajos opcionales, como máximo 8', async () => {
    const { usuario } = await crearSesion('pro@example.com');
    expect((await logica.obtenerPerfil(usuario)).fotos).toEqual([]);
    for (let i = 0; i < 8; i++) await logica.subirFoto(usuario, JPG());
    expect((await logica.obtenerPerfil(usuario)).fotos).toHaveLength(8);
    await expect(logica.subirFoto(usuario, JPG())).rejects.toThrow('como máximo 8 fotos');
  });

  test('41. RF-23 Error: Solo se aceptan imágenes JPG, PNG o WebP de hasta 600 KB', async () => {
    const { usuario } = await crearSesion('pro@example.com');
    await expect(logica.subirFoto(usuario, Buffer.from('<script>alert(1)</script>'))).rejects.toThrow('JPG, PNG o WebP');
    await expect(logica.subirFoto(usuario, undefined)).rejects.toThrow('JPG, PNG o WebP');
    await expect(logica.subirLogo(usuario, JPG(600 * 1024))).rejects.toThrow('demasiado grande');
  });

  test('42. RN-02 Error: Un profesional no puede borrar las fotos de otro', async () => {
    const { usuario: ana } = await crearSesion('ana@example.com');
    const { usuario: luis } = await crearSesion('luis@example.com');
    const foto = await logica.subirFoto(ana, JPG());
    await expect(logica.quitarFoto(luis, foto.id)).rejects.toThrow('otro profesional');
    await logica.quitarFoto(ana, foto.id);
    expect((await logica.obtenerPerfil(ana)).fotos).toEqual([]);
  });

  test('43. RN-08: Las imágenes de una cuenta eliminada dejan de servirse', async () => {
    const { usuario } = await crearSesion('baja@example.com');
    const foto = await logica.subirFoto(usuario, JPG());
    expect((await logica.obtenerImagen(foto.id)).datos.length).toBeGreaterThan(0);
    await logica.eliminarUsuario(usuario, usuario.id);
    await expect(logica.obtenerImagen(foto.id)).rejects.toThrow('Imagen no encontrada');
  });

  test('44. D-17: Al reactivar la cuenta se borran las imágenes anteriores', async () => {
    const { usuario } = await crearSesion('vuelve@example.com');
    await logica.subirLogo(usuario, PNG());
    await logica.subirFoto(usuario, JPG());
    await logica.eliminarUsuario(usuario, usuario.id);
    await logica.registrarUsuario('vuelve@example.com', 'nueva123');
    await logica.confirmarCuenta(correo.ultimoToken());
    const perfil = await logica.obtenerPerfil(usuario);
    expect(perfil.logo).toBeNull();
    expect(perfil.fotos).toEqual([]);
  });

  // --- Sprint 2: servicios con precio (RF-14, RF-15) ---

  // Profesional con perfil guardado en Fontanería; devuelve su usuario y el id del sector
  async function profesionalConPerfil(email = 'pro@example.com') {
    const { usuario } = await crearSesion(email);
    const entrada = await perfilBase();
    await logica.guardarPerfil(usuario, entrada);
    return { usuario, entrada, sectorId: entrada.sectores[0].sectorId };
  }

  test('45. RF-14: Crear un servicio de precio fijo con céntimos', async () => {
    const { usuario, sectorId } = await profesionalConPerfil();
    const servicio = await logica.crearServicio(usuario, {
      sectorId, titulo: 'Cambio de grifo', tipoPrecio: 'fijo', importe: '45,50', ivaIncluido: true
    });
    expect(servicio).toEqual(expect.objectContaining({
      titulo: 'Cambio de grifo', sector: 'Fontanería', tipoPrecio: 'fijo', importe: 45.5, ivaIncluido: true
    }));
    expect((await logica.obtenerPerfil(usuario)).servicios).toHaveLength(1);
  });

  test('46. RF-14: Por hora, por unidad, desde y a consultar', async () => {
    const { usuario, sectorId } = await profesionalConPerfil();
    const hora = await logica.crearServicio(usuario, { sectorId, titulo: 'Urgencias', tipoPrecio: 'hora', importe: 25 });
    const unidad = await logica.crearServicio(usuario, { sectorId, titulo: 'Alicatado', tipoPrecio: 'unidad', importe: '22', unidad: 'm²', ivaIncluido: false });
    const desde = await logica.crearServicio(usuario, { sectorId, titulo: 'Reforma de baño', tipoPrecio: 'desde', importe: 3000 });
    const consultar = await logica.crearServicio(usuario, { sectorId, titulo: 'Proyecto a medida', tipoPrecio: 'consultar' });
    expect(hora.unidad).toBe('hora');
    expect(unidad).toEqual(expect.objectContaining({ importe: 22, unidad: 'm²', ivaIncluido: false }));
    expect(desde.importe).toBe(3000);
    expect(consultar).toEqual(expect.objectContaining({ importe: null, ivaIncluido: null }));
  });

  test('47. RN-06 Error: Servicio «a consultar» con importe, o «por unidad» sin unidad', async () => {
    const { usuario, sectorId } = await profesionalConPerfil();
    await expect(logica.crearServicio(usuario, { sectorId, titulo: 'X', tipoPrecio: 'consultar', importe: 10 })).rejects.toThrow('no lleva importe');
    await expect(logica.crearServicio(usuario, { sectorId, titulo: 'X', tipoPrecio: 'unidad', importe: 10 })).rejects.toThrow('unidad es obligatorio');
    await expect(logica.crearServicio(usuario, { sectorId, titulo: 'X', tipoPrecio: 'fijo' })).rejects.toThrow('Indica el importe');
  });

  test('48. RN-06 Error: Importes a 0, negativos, con tres decimales o no numéricos', async () => {
    const { usuario, sectorId } = await profesionalConPerfil();
    for (const importe of [0, '0,00', -5, '10,555', 'diez', '1e3']) {
      await expect(logica.crearServicio(usuario, { sectorId, titulo: 'X', tipoPrecio: 'fijo', importe })).rejects.toThrow();
    }
    expect((await logica.obtenerPerfil(usuario)).servicios).toHaveLength(0);
  });

  test('49. D-26: Presupuesto cerrado gratuito o con precio de visita', async () => {
    const { usuario, sectorId } = await profesionalConPerfil();
    const gratis = await logica.crearServicio(usuario, { sectorId, titulo: 'Reformas', tipoPrecio: 'presupuesto', presupuestoGratis: true });
    const conVisita = await logica.crearServicio(usuario, { sectorId, titulo: 'Instalación', tipoPrecio: 'presupuesto', presupuestoGratis: false, precioVisita: '20' });
    expect(gratis).toEqual(expect.objectContaining({ presupuestoGratis: true, precioVisita: null, importe: null }));
    expect(conVisita).toEqual(expect.objectContaining({ presupuestoGratis: false, precioVisita: 20 }));
    await expect(logica.crearServicio(usuario, { sectorId, titulo: 'X', tipoPrecio: 'presupuesto', presupuestoGratis: true, precioVisita: 20 })).rejects.toThrow('gratuito');
    await expect(logica.crearServicio(usuario, { sectorId, titulo: 'X', tipoPrecio: 'presupuesto', importe: 100 })).rejects.toThrow('no lleva importe');
  });

  test('50. RN-03 Error: Servicio en un sector que no está en el perfil', async () => {
    const { usuario } = await profesionalConPerfil();
    const pintura = await logica.crearSector('Pintura');
    await expect(logica.crearServicio(usuario, { sectorId: pintura.id, titulo: 'Pintar salón', tipoPrecio: 'fijo', importe: 300 }))
      .rejects.toThrow('uno de los sectores de tu perfil');
  });

  test('51. RN-02 Error: Un profesional edita o borra un servicio de otro', async () => {
    const ana = await profesionalConPerfil('ana@example.com');
    const luis = await profesionalConPerfil('luis@example.com');
    const servicio = await logica.crearServicio(ana.usuario, { sectorId: ana.sectorId, titulo: 'Fugas', tipoPrecio: 'fijo', importe: 40 });
    await expect(logica.editarServicio(luis.usuario, servicio.id, { sectorId: luis.sectorId, titulo: 'Mío', tipoPrecio: 'fijo', importe: 1 }))
      .rejects.toThrow('servicio de otro profesional');
    await expect(logica.borrarServicio(luis.usuario, servicio.id)).rejects.toThrow('servicio de otro profesional');
    expect((await logica.obtenerPerfil(ana.usuario)).servicios[0].titulo).toBe('Fugas');
  });

  test('52. RF-15: Editar y borrar un servicio propio', async () => {
    const { usuario, sectorId } = await profesionalConPerfil();
    const servicio = await logica.crearServicio(usuario, { sectorId, titulo: 'Fugas', tipoPrecio: 'fijo', importe: 40 });
    const editado = await logica.editarServicio(usuario, servicio.id, { sectorId, titulo: 'Fugas urgentes', tipoPrecio: 'desde', importe: 60 });
    expect(editado).toEqual(expect.objectContaining({ titulo: 'Fugas urgentes', tipoPrecio: 'desde', importe: 60 }));
    await logica.borrarServicio(usuario, servicio.id);
    expect((await logica.obtenerPerfil(usuario)).servicios).toEqual([]);
  });

  test('53. RN-03: Quitar un sector con servicios exige confirmación y después los borra', async () => {
    const { usuario, entrada, sectorId } = await profesionalConPerfil();
    const pintura = await logica.crearSector('Pintura');
    entrada.sectores.push({ sectorId: pintura.id, especialidad: 'Interiores' });
    await logica.guardarPerfil(usuario, entrada);
    await logica.crearServicio(usuario, { sectorId, titulo: 'Fugas', tipoPrecio: 'fijo', importe: 40 });
    await logica.crearServicio(usuario, { sectorId: pintura.id, titulo: 'Pintar salón', tipoPrecio: 'fijo', importe: 300 });

    entrada.sectores = entrada.sectores.filter(s => s.sectorId !== sectorId); // quita Fontanería
    const error = await logica.guardarPerfil(usuario, entrada).catch(e => e);
    expect(error.status).toBe(409);
    expect(error.servicios).toEqual([expect.objectContaining({ titulo: 'Fugas', sector: 'Fontanería' })]);
    expect((await logica.obtenerPerfil(usuario)).servicios).toHaveLength(2);

    const perfil = await logica.guardarPerfil(usuario, { ...entrada, confirmarBorrado: true });
    expect(perfil.servicios.map(s => s.titulo)).toEqual(['Pintar salón']);
  });

  test('54. RN-04: No se crean servicios en un sector desactivado, pero los que ya había se pueden editar', async () => {
    const { usuario, sectorId } = await profesionalConPerfil();
    const servicio = await logica.crearServicio(usuario, { sectorId, titulo: 'Fugas', tipoPrecio: 'fijo', importe: 40 });
    await logica.cambiarEstadoSector(sectorId, false);
    await expect(logica.crearServicio(usuario, { sectorId, titulo: 'Nuevo', tipoPrecio: 'fijo', importe: 10 })).rejects.toThrow('ya no se ofrece');
    const editado = await logica.editarServicio(usuario, servicio.id, { sectorId, titulo: 'Fugas y atascos', tipoPrecio: 'fijo', importe: 45 });
    expect(editado.sectorActivo).toBe(false);
  });

  test('55. RF-14 Error: Sin perfil guardado, título demasiado largo o más de 30 servicios', async () => {
    const { usuario: sinPerfil } = await crearSesion('nuevo@example.com');
    await expect(logica.crearServicio(sinPerfil, { titulo: 'X', tipoPrecio: 'consultar' })).rejects.toThrow('Guarda primero tu perfil');

    const { usuario, sectorId } = await profesionalConPerfil();
    await expect(logica.crearServicio(usuario, { sectorId, titulo: 'x'.repeat(81), tipoPrecio: 'consultar' })).rejects.toThrow('80 caracteres');
    for (let i = 0; i < 30; i++) await logica.crearServicio(usuario, { sectorId, titulo: `Servicio ${i}`, tipoPrecio: 'consultar' });
    await expect(logica.crearServicio(usuario, { sectorId, titulo: 'El 31', tipoPrecio: 'consultar' })).rejects.toThrow('como máximo 30');
  });

  // --- Sprint 2: buscador y ficha pública (RF-18 a RF-21, RN-01) ---

  async function sector(nombre) {
    return (await logica.listarSectores({ incluirInactivos: true })).find(s => s.nombre === nombre)
      || await logica.crearSector(nombre);
  }

  // Crea un profesional con perfil completo en las ciudades indicadas y con los servicios indicados.
  // servicios: [{ sector: 'Fontanería', titulo, tipoPrecio, importe }]
  async function publicar(email, { ciudades = ['madrid'], servicios = [], nombre } = {}) {
    const { usuario } = await crearSesion(email);
    // D-35: el perfil necesita al menos un sector aunque todavía no tenga servicios
    const nombresSectores = [...new Set(servicios.map(sv => sv.sector))];
    if (nombresSectores.length === 0) nombresSectores.push('Fontanería');
    const sectores = {};
    for (const n of nombresSectores) sectores[n] = await sector(n);
    const perfil = await logica.guardarPerfil(usuario, {
      nombreComercial: nombre || `Negocio de ${email}`,
      telefono: '600111222',
      sectores: nombresSectores.map(n => ({ sectorId: sectores[n].id, especialidad: 'General' })),
      ciudades: await Promise.all(ciudades.map(idCiudad))
    });
    for (const sv of servicios) {
      await logica.crearServicio(usuario, { ...sv, sectorId: sectores[sv.sector].id });
    }
    return { usuario, perfilId: perfil.id, sectores };
  }

  const buscar = async (parametros) => logica.buscarProfesionales({ ciudad: await idCiudad('madrid'), ...parametros });

  test('56. RN-01: Un perfil completo de usuario activo aparece en la búsqueda y está publicado', async () => {
    const { usuario, perfilId } = await publicar('ana@example.com', {
      servicios: [{ sector: 'Fontanería', titulo: 'Fugas', tipoPrecio: 'fijo', importe: 40 }]
    });
    const resultado = await buscar();
    expect(resultado.total).toBe(1);
    expect(resultado.resultados[0]).toEqual(expect.objectContaining({
      id: perfilId,
      sectores: [{ nombre: 'Fontanería', especialidad: 'General' }],
      contacto: ['telefono'],
      fotos: [],
      totalFotos: 0,
      precioReferencia: 40
    }));
    expect((await logica.obtenerPerfil(usuario)).publicacion).toEqual({ publicado: true, faltan: [] });
  });

  test('57. RN-01: Un perfil sin servicios, o de un usuario pendiente o eliminado, no aparece', async () => {
    const { usuario: sinServicios } = await publicar('vacio@example.com', { servicios: [] });
    const { usuario: eliminado } = await publicar('baja@example.com', {
      servicios: [{ sector: 'Fontanería', titulo: 'Fugas', tipoPrecio: 'fijo', importe: 40 }]
    });
    await logica.eliminarUsuario(eliminado, eliminado.id);
    // Usuario pendiente: se registra pero no confirma; se fuerza su perfil para comprobar la regla en SQL
    await publicar('pendiente@example.com', { servicios: [{ sector: 'Fontanería', titulo: 'Fugas', tipoPrecio: 'fijo', importe: 40 }] });
    const pendiente = await datos.buscarPorEmail('pendiente@example.com');
    await datos.reactivar(pendiente.id, { password: 'x', rol: 'profesional', tokenConfirmacion: 't', tokenExpira: Date.now() });

    expect((await buscar()).total).toBe(0);
    expect((await logica.obtenerPerfil(sinServicios)).publicacion).toEqual({ publicado: false, faltan: ['un servicio'] });
  });

  test('58. RN-04: Los servicios de un sector desactivado no cuentan para publicar ni para buscar', async () => {
    const { sectores } = await publicar('ana@example.com', {
      servicios: [{ sector: 'Mudanzas', titulo: 'Piso pequeño', tipoPrecio: 'fijo', importe: 300 }]
    });
    expect((await buscar()).total).toBe(1);
    await logica.cambiarEstadoSector(sectores.Mudanzas.id, false);
    expect((await buscar()).total).toBe(0);
  });

  test('59. RF-18: Búsqueda por ciudad y sector', async () => {
    await publicar('madrid-fon@example.com', { ciudades: ['madrid'], servicios: [
      { sector: 'Fontanería', titulo: 'Fugas', tipoPrecio: 'fijo', importe: 40 },
      { sector: 'Pintura', titulo: 'Salón', tipoPrecio: 'fijo', importe: 200 }
    ] });
    await publicar('madrid-pin@example.com', { ciudades: ['madrid'], servicios: [{ sector: 'Pintura', titulo: 'Piso', tipoPrecio: 'fijo', importe: 900 }] });
    await publicar('vigo-fon@example.com', { ciudades: ['vigo'], servicios: [{ sector: 'Fontanería', titulo: 'Fugas', tipoPrecio: 'fijo', importe: 30 }] });

    const fontaneria = await sector('Fontanería');
    const resultado = await buscar({ sector: String(fontaneria.id) });
    expect(resultado.total).toBe(1);
    expect(resultado.resultados[0].nombreComercial).toBe('Negocio de madrid-fon@example.com');
    // Solo se muestran los servicios que cumplen el filtro
    expect(resultado.resultados[0].servicios.map(sv => sv.titulo)).toEqual(['Fugas']);
    expect((await buscar()).total).toBe(2);
  });

  test('60. RF-19: Con importe máximo ningún servicio mostrado lo supera; filtro por tipo de precio', async () => {
    await publicar('ana@example.com', { servicios: [
      { sector: 'Fontanería', titulo: 'Grifo', tipoPrecio: 'fijo', importe: 40 },
      { sector: 'Fontanería', titulo: 'Caldera', tipoPrecio: 'fijo', importe: 900 },
      { sector: 'Fontanería', titulo: 'Proyecto', tipoPrecio: 'consultar' }
    ] });
    await publicar('caro@example.com', { servicios: [{ sector: 'Fontanería', titulo: 'Reforma', tipoPrecio: 'desde', importe: 3000 }] });

    const barato = await buscar({ max: '100' });
    expect(barato.total).toBe(1);
    barato.resultados.forEach(r => r.servicios.forEach(sv => expect(sv.importe).toBeLessThanOrEqual(100)));
    expect(barato.resultados[0].servicios.map(sv => sv.titulo)).toEqual(['Grifo']);

    const consultar = await buscar({ tipo: 'consultar' });
    expect(consultar.resultados.map(r => r.servicios.map(sv => sv.titulo))).toEqual([['Proyecto']]);
  });

  test('61. RF-20: Orden por precio de referencia, con «a consultar» y presupuesto cerrado al final', async () => {
    await publicar('medio@example.com', { nombre: 'Medio', servicios: [{ sector: 'Fontanería', titulo: 'A', tipoPrecio: 'fijo', importe: 50 }] });
    await publicar('consulta@example.com', { nombre: 'Consulta', servicios: [{ sector: 'Fontanería', titulo: 'B', tipoPrecio: 'consultar' }] });
    await publicar('barato@example.com', { nombre: 'Barato', servicios: [
      { sector: 'Fontanería', titulo: 'C', tipoPrecio: 'fijo', importe: 300 },
      { sector: 'Fontanería', titulo: 'D', tipoPrecio: 'hora', importe: 20 }
    ] });
    await publicar('presu@example.com', { nombre: 'Presupuesto', servicios: [{ sector: 'Fontanería', titulo: 'E', tipoPrecio: 'presupuesto' }] });

    const nombres = async (orden) => (await buscar({ orden })).resultados.map(r => r.nombreComercial);
    const ascendente = await nombres('precio-asc');
    expect(ascendente.slice(0, 2)).toEqual(['Barato', 'Medio']);
    expect(ascendente.slice(2).sort()).toEqual(['Consulta', 'Presupuesto']);
    const descendente = await nombres('precio-desc');
    expect(descendente.slice(0, 2)).toEqual(['Medio', 'Barato']);
    expect((await buscar()).resultados[0].precioReferencia).toBe(20);
    expect(await nombres('recientes')).toHaveLength(4);
  });

  test('62. RF-20: Paginación de 20 resultados', async () => {
    for (let i = 0; i < 21; i++) {
      await publicar(`p${i}@example.com`, { servicios: [{ sector: 'Fontanería', titulo: 'Fugas', tipoPrecio: 'fijo', importe: 10 + i }] });
    }
    const primera = await buscar();
    const segunda = await buscar({ pagina: '2' });
    expect(primera).toEqual(expect.objectContaining({ total: 21, paginas: 2, pagina: 1 }));
    expect(primera.resultados).toHaveLength(20);
    expect(segunda.resultados).toHaveLength(1);
    expect(segunda.resultados[0].precioReferencia).toBe(30);
  });

  test('63. RF-18 Error: Ciudad obligatoria y parámetros no válidos', async () => {
    await expect(logica.buscarProfesionales({})).rejects.toThrow('Elige una ciudad');
    await expect(logica.buscarProfesionales({ ciudad: '999999' })).rejects.toThrow('no está en el catálogo');
    await expect(buscar({ orden: 'DROP TABLE' })).rejects.toThrow('Orden no válido');
    await expect(buscar({ tipo: 'gratis' })).rejects.toThrow('Tipo de precio no válido');
    await expect(buscar({ max: '-3' })).rejects.toThrow();
    await expect(buscar({ pagina: '0' })).rejects.toThrow('Página no válida');
  });

  test('64. RF-21: Ficha pública sin el email de acceso (RNF-11); no visible si no está publicada', async () => {
    const { usuario, perfilId } = await publicar('secreto@example.com', {
      nombre: 'Fontanería Discreta',
      servicios: [{ sector: 'Fontanería', titulo: 'Fugas', tipoPrecio: 'fijo', importe: 40 }]
    });
    const ficha = await logica.obtenerFichaPublica(perfilId);
    expect(ficha).toEqual(expect.objectContaining({
      nombreComercial: 'Fontanería Discreta',
      contacto: { telefono: '+34 600 111 222' },
      sectores: [expect.objectContaining({ nombre: 'Fontanería', especialidad: 'General' })]
    }));
    expect(ficha.servicios.map(sv => sv.titulo)).toEqual(['Fugas']);
    expect(JSON.stringify(ficha)).not.toContain('secreto@');

    await logica.eliminarUsuario(usuario, usuario.id);
    await expect(logica.obtenerFichaPublica(perfilId)).rejects.toThrow('no está disponible');
  });

  // --- Sprint 2: acceso con Google (RF-04, D-34) ---

  // Entra con Google con la identidad dada; devuelve la sesión y el usuario tal como lo ve la API
  async function entrarConGoogle(email, { googleId = `g-${email}`, emailVerificado = true } = {}) {
    logica.configurarGoogle(crearGoogleFalso({ googleId, email, emailVerificado }));
    const sesion = await logica.entrarConGoogle('codigo-valido');
    return { ...sesion, actual: await logica.comprobarSesion(sesion.token) };
  }

  test('65. RF-04: Con Google se crea un profesional activo, sin correo de confirmación ni contraseña', async () => {
    const { usuario, actual } = await entrarConGoogle('nuevo@gmail.com');
    expect(usuario).toEqual(expect.objectContaining({ email: 'nuevo@gmail.com', rol: 'profesional' }));
    expect(actual.id).toBe(usuario.id);
    expect((await logica.usuarioActivo(usuario.id)).activo).toBe(true);
    expect(correo.enviados).toHaveLength(0);
    // No tiene contraseña utilizable: con contraseña no se entra
    await expect(logica.iniciarSesion('nuevo@gmail.com', '')).rejects.toThrow('Credenciales incorrectas');
    await expect(logica.registrarUsuario('nuevo@gmail.com', '123456')).rejects.toThrow('El usuario ya existe');
  });

  test('66. RF-04: Una cuenta con contraseña se vincula a Google y conserva los dos accesos', async () => {
    const { usuario } = await crearSesion('mixto@gmail.com');
    const { usuario: conGoogle } = await entrarConGoogle('mixto@gmail.com');
    expect(conGoogle.id).toBe(usuario.id);
    const res = await logica.iniciarSesion('mixto@gmail.com', '123456');
    expect(res.usuario.id).toBe(usuario.id);
  });

  test('67. RF-04: Una cuenta pendiente queda activa al entrar con Google y su enlace deja de servir', async () => {
    await logica.registrarUsuario('pendiente@gmail.com', '123456');
    const enlace = correo.ultimoToken();
    const { usuario } = await entrarConGoogle('pendiente@gmail.com');
    expect((await logica.usuarioActivo(usuario.id)).estado).toBe('activo');
    await expect(logica.confirmarCuenta(enlace)).rejects.toThrow('no es válido');
  });

  test('68. RF-04/RN-11: Una cuenta eliminada se reactiva desde cero al entrar con Google', async () => {
    const { usuario } = await crearSesion('vuelve@gmail.com');
    await logica.guardarPerfil(usuario, await perfilBase());
    await logica.eliminarUsuario(usuario, usuario.id);

    const { usuario: reactivado, actual } = await entrarConGoogle('vuelve@gmail.com');
    expect(reactivado.id).toBe(usuario.id);
    expect((await logica.obtenerPerfil(actual)).existe).toBe(false);
    // La contraseña de antes ya no vale
    await expect(logica.iniciarSesion('vuelve@gmail.com', '123456')).rejects.toThrow('Credenciales incorrectas');
  });

  test('69. RF-04: La cuenta se reconoce por su identificador de Google aunque cambie el correo', async () => {
    const primera = await entrarConGoogle('antiguo@gmail.com', { googleId: 'g-123' });
    const segunda = await entrarConGoogle('nuevo@gmail.com', { googleId: 'g-123' });
    expect(segunda.usuario.id).toBe(primera.usuario.id);
    expect(await logica.listarUsuarios()).toHaveLength(1);
  });

  test('70. RF-04 Error: Correo no verificado, código no válido o Google sin configurar', async () => {
    await expect(logica.entrarConGoogle('codigo-valido')).rejects.toThrow('no está disponible');
    expect(() => logica.urlAccesoGoogle('x')).toThrow('no está disponible');

    await expect(entrarConGoogle('raro@gmail.com', { emailVerificado: false }))
      .rejects.toThrow('no tiene el correo verificado');
    await expect(logica.entrarConGoogle('codigo-inventado')).rejects.toThrow('No se pudo completar el acceso con Google');
    await expect(logica.entrarConGoogle('')).rejects.toThrow('no ha devuelto el código');
    expect(await logica.listarUsuarios()).toHaveLength(0);
    expect(logica.urlAccesoGoogle('abc')).toContain('state=abc');
  });

  // --- Retroalimentación del Sprint 2 (D-35) ---

  test('71. D-35 Error: Sin al menos un sector y una ciudad no se guarda el perfil', async () => {
    const { usuario } = await crearSesion('pro@example.com');
    const entrada = await perfilBase();
    await expect(logica.guardarPerfil(usuario, { ...entrada, ciudades: [] })).rejects.toThrow('al menos una ciudad');
    await expect(logica.guardarPerfil(usuario, { ...entrada, sectores: [] })).rejects.toThrow('al menos un sector');
    expect((await logica.obtenerPerfil(usuario)).existe).toBe(false);
  });

  test('72. D-35: Teléfono y WhatsApp con prefijo; sin prefijo se entiende +34', async () => {
    const { usuario } = await crearSesion('pro@example.com');
    const entrada = await perfilBase();
    const guardar = (telefono, whatsapp = '') => logica.guardarPerfil(usuario, { ...entrada, telefono, whatsapp });

    let perfil = await guardar('600111222', '+44 7911 123456');
    expect(perfil.telefono).toBe('+34 600 111 222');
    expect(perfil.whatsapp).toBe('+44 7911123456');
    perfil = await guardar('+34 600 11 12 22', '+34612345678');
    expect(perfil.telefono).toBe('+34 600 111 222');
    expect(perfil.whatsapp).toBe('+34 612 345 678');

    await expect(guardar('+34 60011122')).rejects.toThrow('9 cifras');
    await expect(guardar('+1234 5551234')).rejects.toThrow('de 1 a 3 cifras');
    await expect(guardar('+447911123456')).rejects.toThrow('prefijo del teléfono aparte');
    await expect(guardar('+1 12')).rejects.toThrow('número de cifras válido');
    await expect(guardar('600111222', '+34 6')).rejects.toThrow('WhatsApp español');
  });
});
