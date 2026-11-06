const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const datos = require('./datos');
const { normalizar } = require('./normalizar');
require('dotenv').config();

// RNF-02: el secreto JWT solo puede venir del entorno (.env en local, Secret Manager en Cloud Run).
// No hay valor de respaldo: sin JWT_SECRET no se emite ni se verifica ningún token.
function secretoJwt() {
  const secreto = process.env.JWT_SECRET;
  if (!secreto) {
    throw new Error('Falta JWT_SECRET en las variables de entorno');
  }
  return secreto;
}
const VALIDEZ_TOKEN_CONFIRMACION_MS = 24 * 60 * 60 * 1000; // 24 horas

// Error con código HTTP sugerido, para que la API responda 403/404 sin conocer las reglas
function errorDe(mensaje, status) {
  const error = new Error(mensaje);
  error.status = status;
  return error;
}

const LONGITUD_MAXIMA_SECTOR = 50;
const MAXIMO_CIUDADES_SUGERIDAS = 10;

// Limpia y valida el nombre de un sector; devuelve el nombre a guardar y su forma normalizada
function validarNombreSector(nombre) {
  const limpio = typeof nombre === 'string' ? nombre.trim().replace(/\s+/g, ' ') : '';
  if (!limpio) {
    throw errorDe('El nombre del sector es obligatorio', 400);
  }
  if (limpio.length > LONGITUD_MAXIMA_SECTOR) {
    throw errorDe(`El nombre del sector no puede superar ${LONGITUD_MAXIMA_SECTOR} caracteres`, 400);
  }
  return { nombre: limpio, normalizado: normalizar(limpio) };
}

async function obtenerSector(id) {
  const sector = await datos.buscarSectorPorId(id);
  if (!sector) {
    throw errorDe('Sector no encontrado', 404);
  }
  return sector;
}

// --- Validación del perfil (RN-10, RNF-10) ---

const LIMITES_PERFIL = {
  nombreComercial: 80,
  descripcion: 1000,
  especialidad: 150,
  telefono: 20,
  emailContacto: 254,
  web: 200,
  maximoSectores: 10,
  maximoCiudades: 50
};

// Texto libre: quita espacios sobrantes y caracteres de control; vacío -> null
function textoLimpio(valor, campo, maximo, { obligatorio = false, multilinea = false } = {}) {
  if (valor === undefined || valor === null) valor = '';
  if (typeof valor !== 'string') {
    throw errorDe(`El campo ${campo} debe ser un texto`, 400);
  }
  let limpio = valor.replace(multilinea ? /[\u0000-\u0009\u000B-\u001F\u007F]/g : /[\u0000-\u001F\u007F]/g, '');
  limpio = multilinea ? limpio.trim() : limpio.trim().replace(/\s+/g, ' ');
  if (!limpio) {
    if (obligatorio) throw errorDe(`El campo ${campo} es obligatorio`, 400);
    return null;
  }
  if (limpio.length > maximo) {
    throw errorDe(`El campo ${campo} no puede superar ${maximo} caracteres`, 400);
  }
  return limpio;
}

function telefonoValido(valor, campo) {
  const limpio = textoLimpio(valor, campo, LIMITES_PERFIL.telefono);
  if (limpio && !/^\+?[0-9 ]{6,19}$/.test(limpio)) {
    throw errorDe(`El ${campo} solo puede tener números, espacios y un + inicial`, 400);
  }
  return limpio;
}

function emailValido(valor) {
  const limpio = textoLimpio(valor, 'email de contacto', LIMITES_PERFIL.emailContacto);
  if (limpio && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(limpio)) {
    throw errorDe('El email de contacto no tiene un formato válido', 400);
  }
  return limpio;
}

// La web se guarda siempre con http(s)://; sin protocolo se añade https://
function webValida(valor) {
  let limpio = textoLimpio(valor, 'web', LIMITES_PERFIL.web);
  if (!limpio) return null;
  if (!/^https?:\/\//i.test(limpio)) limpio = `https://${limpio}`;
  let url;
  try {
    url = new URL(limpio);
  } catch (error) {
    throw errorDe('La web no tiene un formato válido', 400);
  }
  if (!['http:', 'https:'].includes(url.protocol) || !url.hostname.includes('.')) {
    throw errorDe('La web no tiene un formato válido', 400);
  }
  return limpio;
}

function idValido(valor) {
  return Number.isInteger(valor) && valor > 0;
}

// --- Imágenes (RF-23) ---

const LIMITES_IMAGEN = {
  bytes: 600 * 1024, // el navegador reduce la imagen antes de subirla
  fotos: 8
};

// Reconoce el formato por los primeros bytes del archivo, no por lo que diga el cliente
function formatoDeImagen(datos) {
  if (!Buffer.isBuffer(datos) || datos.length < 12) return null;
  if (datos[0] === 0xFF && datos[1] === 0xD8 && datos[2] === 0xFF) return 'image/jpeg';
  if (datos.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]))) return 'image/png';
  if (datos.subarray(0, 4).toString('latin1') === 'RIFF' && datos.subarray(8, 12).toString('latin1') === 'WEBP') return 'image/webp';
  return null;
}

function validarImagen(datos) {
  const mime = formatoDeImagen(datos);
  if (!mime) {
    throw errorDe('El archivo debe ser una imagen JPG, PNG o WebP', 400);
  }
  if (datos.length > LIMITES_IMAGEN.bytes) {
    throw errorDe('La imagen es demasiado grande (máximo 600 KB)', 413);
  }
  return mime;
}

function urlImagen(id) {
  return `/api/imagenes/${id}`;
}

// RN-02: solo un profesional tiene perfil, y solo puede tocar el suyo (el id sale siempre de la sesión)
function exigirProfesional(usuario) {
  if (!usuario || usuario.rol !== 'profesional') {
    throw errorDe('Solo los profesionales tienen perfil', 403);
  }
}

// Adaptador de correo inyectado desde la composición (api.js) o desde las pruebas.
// Debe ofrecer: enviarConfirmacion(email, token)
let correo = null;

const logica = {
  configurarCorreo: (adaptador) => {
    correo = adaptador;
  },

  // Registro asíncrono: la cuenta queda pendiente hasta confirmar el correo.
  // RN-11: si el email pertenece a una cuenta eliminada, se reactiva esa misma cuenta.
  registrarUsuario: async (email, password, rol = 'profesional') => {
    if (!correo) {
      throw new Error('El servicio de correo no está configurado');
    }

    const existe = await datos.buscarPorEmail(email);
    if (existe && existe.estado !== 'eliminado') {
      throw new Error('El usuario ya existe');
    }

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);
    const tokenConfirmacion = crypto.randomBytes(32).toString('hex');
    const datosCuenta = {
      email,
      password: passwordHash,
      rol,
      estado: 'pendiente',
      tokenConfirmacion,
      tokenExpira: Date.now() + VALIDEZ_TOKEN_CONFIRMACION_MS
    };

    if (existe) {
      // D-17: la cuenta vuelve a empezar de cero, sin el perfil ni las imágenes de antes
      await datos.borrarPerfilDeUsuario(existe.id);
      await datos.borrarImagenesDeUsuario(existe.id);
      await datos.reactivar(existe.id, datosCuenta);
    } else {
      await datos.guardar(datosCuenta);
    }

    try {
      await correo.enviarConfirmacion(email, tokenConfirmacion);
    } catch (error) {
      // Si el correo no sale, deshacemos el alta para que el usuario pueda volver a intentarlo
      if (existe) {
        await datos.marcarEliminado(existe.id);
      } else {
        await datos.eliminarPorEmail(email);
      }
      console.error(`[registro] Error enviando confirmación a ${email}:`, error.message);
      throw new Error('No se pudo enviar el correo de confirmación. Inténtalo de nuevo más tarde');
    }

    console.log(`[registro] Usuario ${email} ${existe ? 'reactivado' : 'registrado'}, pendiente de confirmar`);
    return { email, rol, estado: 'pendiente' };
  },

  // Confirmación de cuenta a partir del token recibido por correo
  confirmarCuenta: async (token) => {
    if (!token) {
      throw new Error('Falta el token de confirmación');
    }

    const usuario = await datos.buscarPorTokenConfirmacion(token);
    if (!usuario || usuario.estado !== 'pendiente') {
      throw new Error('El enlace de confirmación no es válido o ya se ha usado');
    }
    if (usuario.token_expira && usuario.token_expira < Date.now()) {
      throw new Error('El enlace de confirmación ha caducado');
    }

    await datos.confirmar(usuario.id);
    console.log(`[confirmacion] Cuenta ${usuario.email} confirmada`);
    return { email: usuario.email };
  },

  // Inicio de sesión asíncrono
  iniciarSesion: async (email, password) => {
    const usuario = await datos.buscarPorEmail(email);

    // RN-08: una cuenta eliminada responde igual que una inexistente
    if (!usuario || usuario.estado === 'eliminado') {
      throw new Error('Credenciales incorrectas');
    }

    const passwordValida = await bcrypt.compare(password, usuario.password);
    if (!passwordValida) {
      throw new Error('Credenciales incorrectas');
    }

    // Se comprueba después de la contraseña para no revelar qué cuentas existen
    if (usuario.estado !== 'activo') {
      throw new Error('Debes confirmar tu correo antes de iniciar sesión');
    }

    // Incluimos el rol en el token JWT
    const token = jwt.sign(
      { id: usuario.id, email: usuario.email, rol: usuario.rol },
      secretoJwt(),
      { expiresIn: '2h' }
    );

    return {
      token,
      usuario: { id: usuario.id, email: usuario.email, rol: usuario.rol }
    };
  },

  // Verificación de token JWT (solo firma y caducidad)
  verificarToken: (token) => {
    try {
      return jwt.verify(token, secretoJwt());
    } catch (error) {
      throw new Error('Token inválido o expirado');
    }
  },

  // Verificación completa de una sesión: token válido y cuenta todavía activa.
  // RN-08: si la cuenta se elimina, sus tokens dejan de servir aunque no hayan caducado.
  // El rol se toma de la base de datos, no del token, para que un cambio de rol se aplique ya.
  comprobarSesion: async (token) => {
    const datosToken = logica.verificarToken(token);
    const usuario = await datos.buscarPorId(datosToken.id);
    if (!usuario || usuario.estado !== 'activo') {
      throw new Error('La sesión ya no es válida');
    }
    return { id: usuario.id, email: usuario.email, rol: usuario.rol };
  },

  // Listar usuarios (solo accesible por Administradores): email, rol y estado
  listarUsuarios: async () => {
    return await datos.obtenerTodos();
  },

  // RF-08: comprobar si un usuario está activo (confirmado o creado por OAuth, y no eliminado)
  usuarioActivo: async (id) => {
    const usuario = await datos.buscarPorId(id);
    if (!usuario) {
      throw errorDe('Usuario no encontrado', 404);
    }
    return {
      id: usuario.id,
      email: usuario.email,
      estado: usuario.estado,
      activo: usuario.estado === 'activo'
    };
  },

  // RF-09: eliminar un usuario (borrado lógico, RN-08) aplicando RN-09:
  // un profesional solo puede eliminarse a sí mismo; el administrador puede eliminar a cualquiera salvo a sí mismo.
  eliminarUsuario: async (solicitante, idObjetivo) => {
    const esAdmin = solicitante.rol === 'admin';
    const esElMismo = solicitante.id === idObjetivo;

    if (esAdmin && esElMismo) {
      throw errorDe('El administrador no puede eliminar su propia cuenta', 403);
    }
    if (!esAdmin && !esElMismo) {
      throw errorDe('No tienes permiso para eliminar a otro usuario', 403);
    }

    const usuario = await datos.buscarPorId(idObjetivo);
    if (!usuario || usuario.estado === 'eliminado') {
      throw errorDe('Usuario no encontrado', 404);
    }

    await datos.marcarEliminado(usuario.id);
    console.log(`[eliminacion] Cuenta ${usuario.email} eliminada por ${solicitante.email}`);
    return { id: usuario.id, email: usuario.email, estado: 'eliminado' };
  },

  // --- Sectores (RF-17, RF-22) ---

  // RF-17: sectores activos, para el buscador y los formularios. El administrador puede pedir también los inactivos
  listarSectores: async ({ incluirInactivos = false } = {}) => {
    return await datos.listarSectores(!incluirInactivos);
  },

  // RF-22 + RN-05: no puede haber dos sectores con el mismo nombre sin distinguir mayúsculas ni tildes
  crearSector: async (nombre) => {
    const sector = validarNombreSector(nombre);
    if (await datos.buscarSectorPorNombreNormalizado(sector.normalizado)) {
      throw errorDe('Ya existe un sector con ese nombre', 409);
    }
    const creado = await datos.crearSector(sector);
    console.log(`[sectores] Sector creado: ${creado.nombre}`);
    return creado;
  },

  renombrarSector: async (id, nombre) => {
    const actual = await obtenerSector(id);
    const sector = validarNombreSector(nombre);
    const mismoNombre = await datos.buscarSectorPorNombreNormalizado(sector.normalizado);
    if (mismoNombre && mismoNombre.id !== actual.id) {
      throw errorDe('Ya existe un sector con ese nombre', 409);
    }
    await datos.renombrarSector(actual.id, sector);
    return { ...actual, nombre: sector.nombre };
  },

  // RN-04: desactivar oculta el sector, pero no lo borra (se puede volver a activar)
  cambiarEstadoSector: async (id, activo) => {
    if (typeof activo !== 'boolean') {
      throw errorDe('El campo activo debe ser true o false', 400);
    }
    const actual = await obtenerSector(id);
    await datos.cambiarActivoSector(actual.id, activo);
    return { ...actual, activo };
  },

  // --- Ciudades ---

  // Autocompletado: busca sin distinguir mayúsculas ni tildes ("caceres" encuentra "Cáceres").
  // Con menos de 2 letras no se busca, para no devolver medio catálogo.
  buscarCiudades: async (texto) => {
    const normalizado = normalizar(texto);
    if (normalizado.length < 2) {
      return [];
    }
    return await datos.buscarCiudades(normalizado, MAXIMO_CIUDADES_SUGERIDAS);
  },

  // --- Perfil del profesional (RF-11, RF-12, RF-13) ---

  // Devuelve el perfil del propio profesional; si aún no lo ha creado, uno vacío con existe: false
  obtenerPerfil: async (usuario) => {
    exigirProfesional(usuario);
    const perfil = await datos.buscarPerfilPorUsuario(usuario.id);
    const imagenes = await datos.imagenesDeUsuario(usuario.id);
    const logo = imagenes.find((i) => i.tipo === 'logo');
    const conImagenes = {
      logo: logo ? { id: logo.id, url: urlImagen(logo.id) } : null,
      fotos: imagenes.filter((i) => i.tipo === 'trabajo').map((i) => ({ id: i.id, url: urlImagen(i.id) }))
    };
    if (!perfil) {
      return {
        existe: false, nombreComercial: '', descripcion: '', telefono: '', emailContacto: '',
        web: '', whatsapp: '', actualizado: null, sectores: [], ciudades: [], ...conImagenes
      };
    }
    return {
      ...conImagenes,
      existe: true,
      nombreComercial: perfil.nombre_comercial,
      descripcion: perfil.descripcion || '',
      telefono: perfil.telefono || '',
      emailContacto: perfil.email_contacto || '',
      web: perfil.web || '',
      whatsapp: perfil.whatsapp || '',
      actualizado: perfil.actualizado,
      sectores: await datos.sectoresDePerfil(perfil.id),
      ciudades: await datos.ciudadesDePerfil(perfil.id)
    };
  },

  // Crea o edita el perfil completo. Valida todo antes de escribir nada.
  // Cuerpo: { nombreComercial, descripcion, telefono, emailContacto, web, whatsapp,
  //           sectores: [{ sectorId, especialidad }], ciudades: [ciudadId] }
  guardarPerfil: async (usuario, entrada = {}) => {
    exigirProfesional(usuario);

    // RF-11 + RN-10: datos básicos
    const basicos = {
      nombreComercial: textoLimpio(entrada.nombreComercial, 'nombre comercial', LIMITES_PERFIL.nombreComercial, { obligatorio: true }),
      descripcion: textoLimpio(entrada.descripcion, 'descripción', LIMITES_PERFIL.descripcion, { multilinea: true }),
      telefono: telefonoValido(entrada.telefono, 'teléfono'),
      emailContacto: emailValido(entrada.emailContacto),
      web: webValida(entrada.web),
      whatsapp: telefonoValido(entrada.whatsapp, 'WhatsApp')
    };
    // RNF-11: el email de contacto es aparte del de acceso; debe haber al menos un medio de contacto
    if (!basicos.telefono && !basicos.emailContacto && !basicos.web && !basicos.whatsapp) {
      throw errorDe('Indica al menos un dato de contacto: teléfono, email, web o WhatsApp', 400);
    }

    const perfilActual = await datos.buscarPerfilPorUsuario(usuario.id);
    const sectoresActuales = perfilActual ? await datos.sectoresDePerfil(perfilActual.id) : [];

    // RF-12 + RN-04: sectores del catálogo, sin repetir, con especialidad
    const listaSectores = entrada.sectores ?? [];
    if (!Array.isArray(listaSectores)) throw errorDe('Los sectores deben ser una lista', 400);
    if (listaSectores.length > LIMITES_PERFIL.maximoSectores) {
      throw errorDe(`Puedes elegir como máximo ${LIMITES_PERFIL.maximoSectores} sectores`, 400);
    }
    const sectores = [];
    for (const elegido of listaSectores) {
      const sectorId = elegido && elegido.sectorId;
      if (!idValido(sectorId)) throw errorDe('Sector no válido', 400);
      if (sectores.some((s) => s.sectorId === sectorId)) throw errorDe('No puedes elegir el mismo sector dos veces', 400);
      const sector = await datos.buscarSectorPorId(sectorId);
      if (!sector) throw errorDe('Sector no válido', 400);
      // Un sector desactivado no se puede añadir, pero si ya lo tenías puedes conservarlo
      const yaLoTenia = sectoresActuales.some((s) => s.id === sectorId);
      if (!sector.activo && !yaLoTenia) {
        throw errorDe(`El sector ${sector.nombre} no está disponible`, 400);
      }
      const especialidad = textoLimpio(elegido.especialidad, `especialidad de ${sector.nombre}`,
        LIMITES_PERFIL.especialidad, { obligatorio: true });
      sectores.push({ sectorId, especialidad });
    }

    // RF-13 + RN-07: ciudades del catálogo y sin repetir
    const listaCiudades = entrada.ciudades ?? [];
    if (!Array.isArray(listaCiudades)) throw errorDe('Las ciudades deben ser una lista', 400);
    if (listaCiudades.length > LIMITES_PERFIL.maximoCiudades) {
      throw errorDe(`Puedes elegir como máximo ${LIMITES_PERFIL.maximoCiudades} ciudades`, 400);
    }
    const ciudades = [];
    for (const ciudadId of listaCiudades) {
      if (!idValido(ciudadId) || !(await datos.buscarCiudadPorId(ciudadId))) {
        throw errorDe('La ciudad elegida no existe en el catálogo', 400);
      }
      if (ciudades.includes(ciudadId)) throw errorDe('No puedes elegir la misma ciudad dos veces', 400);
      ciudades.push(ciudadId);
    }

    // Todo es válido: se escribe
    const perfilId = await datos.guardarPerfil(usuario.id, basicos);
    // RN-03 (paso 5): al quitar un sector se borrarán también sus servicios
    await datos.reemplazarSectoresPerfil(perfilId, sectores);
    await datos.reemplazarCiudadesPerfil(perfilId, ciudades);
    console.log(`[perfil] Perfil de ${usuario.email} guardado`);
    return await logica.obtenerPerfil(usuario);
  },

  // --- Logo y fotos de trabajos (RF-23, opcionales) ---

  // Sube o sustituye el logo del profesional
  subirLogo: async (usuario, contenido) => {
    exigirProfesional(usuario);
    const mime = validarImagen(contenido);
    await datos.borrarLogo(usuario.id);
    const id = await datos.guardarImagen({ usuarioId: usuario.id, tipo: 'logo', mime, datos: contenido });
    return { id, url: urlImagen(id) };
  },

  quitarLogo: async (usuario) => {
    exigirProfesional(usuario);
    await datos.borrarLogo(usuario.id);
  },

  // Añade una foto de trabajos; como mucho LIMITES_IMAGEN.fotos por profesional
  subirFoto: async (usuario, contenido) => {
    exigirProfesional(usuario);
    const mime = validarImagen(contenido);
    const fotos = (await datos.imagenesDeUsuario(usuario.id)).filter((i) => i.tipo === 'trabajo');
    if (fotos.length >= LIMITES_IMAGEN.fotos) {
      throw errorDe(`Puedes publicar como máximo ${LIMITES_IMAGEN.fotos} fotos`, 400);
    }
    const id = await datos.guardarImagen({ usuarioId: usuario.id, tipo: 'trabajo', mime, datos: contenido });
    return { id, url: urlImagen(id) };
  },

  // RN-02: solo se pueden borrar las fotos propias
  quitarFoto: async (usuario, id) => {
    exigirProfesional(usuario);
    const imagen = await datos.buscarImagen(id);
    if (!imagen || imagen.tipo !== 'trabajo') {
      throw errorDe('Foto no encontrada', 404);
    }
    if (imagen.usuario_id !== usuario.id) {
      throw errorDe('No puedes borrar una foto de otro profesional', 403);
    }
    await datos.borrarImagen(id);
  },

  // Imagen pública para la ficha. RN-08: las de cuentas no activas no se sirven
  obtenerImagen: async (id) => {
    const imagen = await datos.buscarImagen(id);
    if (!imagen || imagen.estado !== 'activo') {
      throw errorDe('Imagen no encontrada', 404);
    }
    return { mime: imagen.mime, datos: imagen.datos };
  },

  // Creación automática del admin usando variables de entorno para mayor seguridad
  inicializarAdminPorDefecto: async () => {
    try {
      // 1. Tu correo de administrador (puedes cambiarlo aquí)
      const emailAdmin = 'admin@admin.com'; 
      
      // 2. La contraseña se lee de forma segura del sistema (Cloud Run / .env)
      const passwordEnTextoPlano = process.env.ADMIN_PASSWORD;

      if (!passwordEnTextoPlano) {
        return; // Si no hay contraseña configurada en el entorno, no hace nada
      }

      const existe = await datos.buscarPorEmail(emailAdmin);

      if (!existe) {
        const salt = await bcrypt.genSalt(10);
        const passwordHash = await bcrypt.hash(passwordEnTextoPlano, salt);

        await datos.guardar({
          email: emailAdmin,
          password: passwordHash,
          rol: 'admin',
          estado: 'activo'
        });
        console.log('✅ Usuario administrador creado de forma segura.');
      }
    } catch (error) {
      console.error('Error al inicializar el administrador:', error.message);
    }
  }
};

// Se ejecuta al arrancar el servidor
logica.inicializarAdminPorDefecto();

module.exports = logica;
