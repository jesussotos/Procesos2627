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

// --- Servicios (RF-14, RF-15) ---

const LIMITES_SERVICIO = {
  titulo: 80,
  descripcion: 1000,
  unidad: 20,
  maximoServicios: 30,
  importeMaximoCentimos: 100000000 // 1.000.000 €
};

// Tipos de precio: los cinco de la especificación (apartado 3.2) y el presupuesto cerrado (D-26)
const TIPOS_PRECIO = ['fijo', 'hora', 'unidad', 'desde', 'consultar', 'presupuesto'];
const TIPOS_CON_IMPORTE = ['fijo', 'hora', 'unidad', 'desde'];

function estaVacio(valor) {
  return valor === undefined || valor === null || (typeof valor === 'string' && valor.trim() === '');
}

// Convierte un importe en euros ("22,50", "22.5" o 22.5) a céntimos enteros (D-25).
// Debe ser mayor que 0 y tener como mucho dos decimales.
function leerImporte(valor, campo) {
  let texto;
  if (typeof valor === 'number') {
    if (!Number.isFinite(valor)) throw errorDe(`${campo} no es un número válido`, 400);
    texto = String(valor);
  } else if (typeof valor === 'string') {
    texto = valor.trim().replace(',', '.');
  } else {
    throw errorDe(`${campo} no es un número válido`, 400);
  }
  if (!/^\d+(\.\d{1,2})?$/.test(texto)) {
    throw errorDe(`${campo} debe ser un número positivo con, como mucho, dos decimales`, 400);
  }
  const [enteros, decimales = ''] = texto.split('.');
  const centimos = Number(enteros) * 100 + Number(decimales.padEnd(2, '0'));
  if (centimos <= 0) {
    throw errorDe(`${campo} debe ser mayor que 0`, 400);
  }
  if (centimos > LIMITES_SERVICIO.importeMaximoCentimos) {
    throw errorDe(`${campo} no puede superar 1.000.000 €`, 400);
  }
  return centimos;
}

// Valida un servicio y devuelve los datos listos para guardar.
// sectoresDelPerfil: [{ id, nombre, activo }]; sectorActualId: sector que ya tenía (al editar)
function validarServicio(entrada, sectoresDelPerfil, sectorActualId = null) {
  const titulo = textoLimpio(entrada.titulo, 'título', LIMITES_SERVICIO.titulo, { obligatorio: true });
  const descripcion = textoLimpio(entrada.descripcion, 'descripción', LIMITES_SERVICIO.descripcion, { multilinea: true });

  // RN-03: el sector del servicio tiene que ser uno de los del perfil
  const sectorId = entrada.sectorId;
  const sector = idValido(sectorId) ? sectoresDelPerfil.find((s) => s.id === sectorId) : null;
  if (!sector) {
    throw errorDe('El servicio debe pertenecer a uno de los sectores de tu perfil', 400);
  }
  // RN-04: no se usan sectores desactivados, salvo para conservar el que ya tenía el servicio
  if (!sector.activo && sectorId !== sectorActualId) {
    throw errorDe(`El sector ${sector.nombre} ya no se ofrece`, 400);
  }

  const tipoPrecio = entrada.tipoPrecio;
  if (!TIPOS_PRECIO.includes(tipoPrecio)) {
    throw errorDe('Tipo de precio no válido', 400);
  }

  // RN-06: importe obligatorio y mayor que 0 salvo en «a consultar» y «presupuesto cerrado»
  let importeCentimos = null;
  if (TIPOS_CON_IMPORTE.includes(tipoPrecio)) {
    if (estaVacio(entrada.importe)) throw errorDe('Indica el importe del servicio', 400);
    importeCentimos = leerImporte(entrada.importe, 'El importe');
  } else if (!estaVacio(entrada.importe)) {
    throw errorDe(tipoPrecio === 'consultar'
      ? 'Un servicio «a consultar» no lleva importe'
      : 'Un servicio con presupuesto cerrado no lleva importe', 400);
  }

  // RN-06: la unidad solo es obligatoria en «por unidad»; en «por hora» es siempre «hora»
  let unidad = null;
  if (tipoPrecio === 'unidad') {
    unidad = textoLimpio(entrada.unidad, 'unidad', LIMITES_SERVICIO.unidad, { obligatorio: true });
  } else if (tipoPrecio === 'hora') {
    unidad = 'hora';
  }

  // IVA: solo tiene sentido si hay importe
  const ivaIncluido = importeCentimos === null ? null : (entrada.ivaIncluido === false ? 0 : 1);

  // Presupuesto cerrado (D-26): gratuito o, si no, con un precio de visita opcional
  let presupuestoGratis = null;
  let visitaCentimos = null;
  if (tipoPrecio === 'presupuesto') {
    presupuestoGratis = entrada.presupuestoGratis === false ? 0 : 1;
    if (!estaVacio(entrada.precioVisita)) {
      if (presupuestoGratis) {
        throw errorDe('Si el presupuesto es gratuito, no indiques precio de visita', 400);
      }
      visitaCentimos = leerImporte(entrada.precioVisita, 'El precio de la visita');
    }
  }

  return { sectorId, titulo, descripcion, tipoPrecio, importeCentimos, unidad, ivaIncluido, presupuestoGratis, visitaCentimos };
}

// Servicio tal como lo devuelve la API: importes en euros y booleanos de verdad
function aServicioPublico(fila) {
  const euros = (centimos) => (centimos === null || centimos === undefined ? null : centimos / 100);
  const booleano = (valor) => (valor === null || valor === undefined ? null : Boolean(valor));
  return {
    id: fila.id,
    sectorId: fila.sector_id,
    sector: fila.sector_nombre,
    sectorActivo: fila.sector_activo === undefined ? undefined : Boolean(fila.sector_activo),
    titulo: fila.titulo,
    descripcion: fila.descripcion || '',
    tipoPrecio: fila.tipo_precio,
    importe: euros(fila.importe_centimos),
    unidad: fila.unidad,
    ivaIncluido: booleano(fila.iva_incluido),
    presupuestoGratis: booleano(fila.presupuesto_gratis),
    precioVisita: euros(fila.visita_centimos)
  };
}

// Perfil del profesional que hace la petición, o error si aún no lo ha creado
async function perfilPropio(usuario) {
  exigirProfesional(usuario);
  const perfil = await datos.buscarPerfilPorUsuario(usuario.id);
  if (!perfil) {
    throw errorDe('Guarda primero tu perfil con al menos un sector para añadir servicios', 400);
  }
  return perfil;
}

// RN-02: el servicio tiene que existir y ser del profesional que lo pide
async function servicioPropio(usuario, id) {
  exigirProfesional(usuario);
  const servicio = await datos.buscarServicio(id);
  if (!servicio) {
    throw errorDe('Servicio no encontrado', 404);
  }
  if (servicio.usuario_id !== usuario.id) {
    throw errorDe('No puedes modificar un servicio de otro profesional', 403);
  }
  // Si el servicio es suyo, su perfil existe
  return { perfil: await datos.buscarPerfilPorUsuario(usuario.id), servicio };
}

// --- Buscador (RF-18 a RF-20) ---

const RESULTADOS_POR_PAGINA = 20;
const ORDENES_BUSQUEDA = ['precio-asc', 'precio-desc', 'recientes'];
const SERVICIOS_POR_RESULTADO = 3;

// Los parámetros llegan como texto desde la URL; vacío equivale a no indicarlo
function idOpcional(valor, mensaje) {
  if (estaVacio(valor)) return null;
  const id = Number(valor);
  if (!idValido(id)) throw errorDe(mensaje, 400);
  return id;
}

// Agrupa una lista de filas por perfil_id: { [perfilId]: [filas] }
function agruparPorPerfil(filas) {
  const grupos = {};
  filas.forEach((fila) => {
    (grupos[fila.perfil_id] = grupos[fila.perfil_id] || []).push(fila);
  });
  return grupos;
}

// Datos de contacto que el profesional ha decidido publicar (RNF-11: nunca su email de acceso)
function contactoPublico(perfil) {
  const contacto = {};
  if (perfil.telefono) contacto.telefono = perfil.telefono;
  if (perfil.whatsapp) contacto.whatsapp = perfil.whatsapp;
  if (perfil.email_contacto) contacto.email = perfil.email_contacto;
  if (perfil.web) contacto.web = perfil.web;
  return contacto;
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
        web: '', whatsapp: '', actualizado: null, sectores: [], ciudades: [], servicios: [], ...conImagenes,
        id: null,
        publicacion: { publicado: false, faltan: ['nombre comercial', 'un dato de contacto', 'un sector', 'una ciudad', 'un servicio'] }
      };
    }
    const sectores = await datos.sectoresDePerfil(perfil.id);
    const ciudades = await datos.ciudadesDePerfil(perfil.id);
    const servicios = (await datos.serviciosDePerfil(perfil.id)).map(aServicioPublico);

    // RF-16: qué le falta para cumplir RN-01 (la misma regla que aplica el buscador en SQL)
    const faltan = [];
    if (!perfil.nombre_comercial) faltan.push('nombre comercial');
    if (!perfil.telefono && !perfil.email_contacto && !perfil.web && !perfil.whatsapp) faltan.push('un dato de contacto');
    if (!sectores.some((s) => s.activo)) faltan.push('un sector');
    if (ciudades.length === 0) faltan.push('una ciudad');
    if (!servicios.some((sv) => sv.sectorActivo)) faltan.push('un servicio');

    return {
      ...conImagenes,
      id: perfil.id,
      publicacion: { publicado: faltan.length === 0, faltan },
      servicios,
      existe: true,
      nombreComercial: perfil.nombre_comercial,
      descripcion: perfil.descripcion || '',
      telefono: perfil.telefono || '',
      emailContacto: perfil.email_contacto || '',
      web: perfil.web || '',
      whatsapp: perfil.whatsapp || '',
      actualizado: perfil.actualizado,
      sectores,
      ciudades
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

    // RN-03: si se quitan sectores con servicios, se borran esos servicios, pero solo tras confirmarlo
    const sectoresQuitados = sectoresActuales
      .filter((actual) => !sectores.some((s) => s.sectorId === actual.id))
      .map((s) => s.id);
    if (perfilActual && sectoresQuitados.length > 0) {
      const afectados = (await datos.serviciosDePerfil(perfilActual.id))
        .filter((sv) => sectoresQuitados.includes(sv.sector_id));
      if (afectados.length > 0 && entrada.confirmarBorrado !== true) {
        const error = errorDe('Al quitar estos sectores se borrarán sus servicios. Confírmalo para continuar', 409);
        error.servicios = afectados.map((sv) => ({ id: sv.id, titulo: sv.titulo, sector: sv.sector_nombre }));
        throw error;
      }
    }

    // Todo es válido: se escribe
    const perfilId = await datos.guardarPerfil(usuario.id, basicos);
    await datos.borrarServiciosDeSectores(perfilId, sectoresQuitados);
    await datos.reemplazarSectoresPerfil(perfilId, sectores);
    await datos.reemplazarCiudadesPerfil(perfilId, ciudades);
    console.log(`[perfil] Perfil de ${usuario.email} guardado`);
    return await logica.obtenerPerfil(usuario);
  },

  // --- Servicios (RF-14, RF-15) ---

  // RF-14: crear un servicio dentro de uno de los sectores del perfil
  crearServicio: async (usuario, entrada = {}) => {
    const perfil = await perfilPropio(usuario);
    const existentes = await datos.serviciosDePerfil(perfil.id);
    if (existentes.length >= LIMITES_SERVICIO.maximoServicios) {
      throw errorDe(`Puedes publicar como máximo ${LIMITES_SERVICIO.maximoServicios} servicios`, 400);
    }
    const servicio = validarServicio(entrada, await datos.sectoresDePerfil(perfil.id));
    const id = await datos.crearServicio(perfil.id, servicio);
    console.log(`[servicios] ${usuario.email} crea «${servicio.titulo}»`);
    return (await datos.serviciosDePerfil(perfil.id)).map(aServicioPublico).find((sv) => sv.id === id);
  },

  // RF-15 + RN-02: editar un servicio propio
  editarServicio: async (usuario, id, entrada = {}) => {
    const { perfil, servicio } = await servicioPropio(usuario, id);
    const datosNuevos = validarServicio(entrada, await datos.sectoresDePerfil(perfil.id), servicio.sector_id);
    await datos.actualizarServicio(id, datosNuevos);
    return (await datos.serviciosDePerfil(perfil.id)).map(aServicioPublico).find((sv) => sv.id === id);
  },

  // RF-15 + RN-02: borrar un servicio propio
  borrarServicio: async (usuario, id) => {
    await servicioPropio(usuario, id);
    await datos.borrarServicio(id);
  },

  // --- Buscador público (RF-18, RF-19, RF-20) ---

  // Parámetros (texto, como llegan en la URL): ciudad (obligatoria), sector, tipo, max, orden, pagina
  buscarProfesionales: async (parametros = {}) => {
    const ciudadId = idOpcional(parametros.ciudad, 'La ciudad no es válida');
    if (!ciudadId) {
      throw errorDe('Elige una ciudad para buscar', 400);
    }
    const ciudad = await datos.buscarCiudadPorId(ciudadId);
    if (!ciudad) {
      throw errorDe('La ciudad no está en el catálogo', 400);
    }

    // RN-04: un sector desactivado no se puede usar para buscar
    const sectorId = idOpcional(parametros.sector, 'El sector no es válido');
    let sector = null;
    if (sectorId) {
      sector = await datos.buscarSectorPorId(sectorId);
      if (!sector || !sector.activo) throw errorDe('Ese sector no está disponible', 400);
    }

    // RF-19: tipo de precio e importe máximo
    const tipoPrecio = estaVacio(parametros.tipo) ? null : parametros.tipo;
    if (tipoPrecio && !TIPOS_PRECIO.includes(tipoPrecio)) {
      throw errorDe('Tipo de precio no válido', 400);
    }
    const maxCentimos = estaVacio(parametros.max) ? null : leerImporte(parametros.max, 'El importe máximo');

    // RF-20: orden y página
    const orden = estaVacio(parametros.orden) ? 'precio-asc' : parametros.orden;
    if (!ORDENES_BUSQUEDA.includes(orden)) {
      throw errorDe('Orden no válido', 400);
    }
    const pagina = estaVacio(parametros.pagina) ? 1 : Number(parametros.pagina);
    if (!Number.isInteger(pagina) || pagina < 1 || pagina > 1000) {
      throw errorDe('Página no válida', 400);
    }

    const filtros = { sectorId, tipoPrecio, maxCentimos };
    const { total, filas } = await datos.buscarProfesionales({
      ciudadId, ...filtros, orden,
      limite: RESULTADOS_POR_PAGINA,
      desplazamiento: (pagina - 1) * RESULTADOS_POR_PAGINA
    });

    // Detalles de los perfiles de esta página, con pocas consultas
    const ids = filas.map((f) => f.id);
    const perfiles = Object.fromEntries((await datos.perfilesPorIds(ids)).map((p) => [p.id, p]));
    const sectores = agruparPorPerfil(await datos.sectoresActivosDePerfiles(ids));
    const ciudades = agruparPorPerfil(await datos.ciudadesDePerfiles(ids));
    const servicios = agruparPorPerfil(await datos.serviciosPublicosDePerfiles(ids, filtros));

    const resultados = filas.map((fila) => {
      const perfil = perfiles[fila.id];
      const coincidentes = (servicios[fila.id] || []).map(aServicioPublico);
      return {
        id: fila.id,
        nombreComercial: perfil.nombre_comercial,
        logo: perfil.logo_id ? { url: urlImagen(perfil.logo_id) } : null,
        sectores: (sectores[fila.id] || []).map((s) => s.nombre),
        ciudades: (ciudades[fila.id] || []).map(({ id, nombre, provincia }) => ({ id, nombre, provincia })),
        precioReferencia: fila.referencia === null ? null : fila.referencia / 100,
        serviciosCoincidentes: coincidentes.length,
        servicios: coincidentes.slice(0, SERVICIOS_POR_RESULTADO)
      };
    });

    return {
      ciudad,
      sector: sector ? { id: sector.id, nombre: sector.nombre } : null,
      filtros: { tipo: tipoPrecio, max: maxCentimos === null ? null : maxCentimos / 100, orden },
      total,
      pagina,
      paginas: Math.ceil(total / RESULTADOS_POR_PAGINA),
      porPagina: RESULTADOS_POR_PAGINA,
      resultados
    };
  },

  // RF-21: ficha pública de un profesional, solo si su perfil está publicado (RN-01)
  obtenerFichaPublica: async (perfilId) => {
    if (!idValido(perfilId) || !(await datos.perfilPublicado(perfilId))) {
      throw errorDe('Este profesional no está disponible', 404);
    }
    const [perfil] = await datos.perfilesPorIds([perfilId]);
    const imagenes = await datos.imagenesDeUsuario(perfil.usuario_id);
    const logo = imagenes.find((i) => i.tipo === 'logo');
    return {
      id: perfil.id,
      nombreComercial: perfil.nombre_comercial,
      descripcion: perfil.descripcion || '',
      contacto: contactoPublico(perfil),
      logo: logo ? { url: urlImagen(logo.id) } : null,
      fotos: imagenes.filter((i) => i.tipo === 'trabajo').map((i) => ({ url: urlImagen(i.id) })),
      sectores: (await datos.sectoresActivosDePerfiles([perfil.id])).map(({ id, nombre, especialidad }) => ({ id, nombre, especialidad })),
      ciudades: (await datos.ciudadesDePerfiles([perfil.id])).map(({ id, nombre, provincia }) => ({ id, nombre, provincia })),
      servicios: (await datos.serviciosPublicosDePerfiles([perfil.id])).map(aServicioPublico),
      actualizado: perfil.actualizado
    };
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
