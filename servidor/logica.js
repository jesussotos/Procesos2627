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
      // Cuando exista el perfil profesional, aquí se descartará el perfil anterior
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
