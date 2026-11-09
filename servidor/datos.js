const { createClient } = require('@libsql/client');
const path = require('path');
require('dotenv').config();
const { normalizar } = require('./normalizar');
const { SECTORES_INICIALES, CIUDADES } = require('./catalogos');

// Elige la base de datos según el entorno:
// - Producción (Cloud Run) y local con Turso: TURSO_DATABASE_URL + TURSO_AUTH_TOKEN.
// - Sin Turso: archivo SQLite local (DB_PATH o servidor/database.sqlite).
// - Pruebas (Jest pone NODE_ENV=test): base en memoria. Nunca se usa Turso en
//   las pruebas, porque limpiar() borraría los usuarios reales.
function configuracion() {
  if (process.env.NODE_ENV === 'test') {
    return { url: ':memory:' };
  }
  if (process.env.TURSO_DATABASE_URL) {
    return {
      url: process.env.TURSO_DATABASE_URL,
      authToken: process.env.TURSO_AUTH_TOKEN
    };
  }
  const ruta = process.env.DB_PATH || path.join(__dirname, 'database.sqlite');
  // Ruta relativa con '/' para que la URL no dependa de espacios o tildes de la carpeta
  const relativa = path.relative(process.cwd(), ruta).split(path.sep).join('/');
  return { url: `file:${relativa}` };
}

const config = configuracion();
const db = createClient(config);
console.log(`[datos] Base de datos: ${config.url.startsWith('libsql') ? 'Turso' : config.url}`);

// Crea la tabla y aplica las migraciones antes de la primera consulta
async function inicializar() {
  await db.execute(`
    CREATE TABLE IF NOT EXISTS usuarios (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      rol TEXT DEFAULT 'profesional',
      estado TEXT NOT NULL DEFAULT 'pendiente',
      token_confirmacion TEXT,
      token_expira INTEGER
    )
  `);

  // Migración para bases creadas antes de la confirmación por correo:
  // si la columna ya existe, SQLite devuelve error y simplemente lo ignoramos.
  const migraciones = [
    'ALTER TABLE usuarios ADD COLUMN token_confirmacion TEXT',
    'ALTER TABLE usuarios ADD COLUMN token_expira INTEGER'
  ];
  for (const sql of migraciones) {
    try {
      await db.execute(sql);
    } catch (err) {
      // columna ya existente
    }
  }

  // Migración del Sprint 2: la columna booleana `confirmado` pasa a ser `estado`.
  // Solo se ejecuta una vez: si `estado` ya existe, el ALTER falla y no se toca nada.
  let estadoNuevo = false;
  try {
    await db.execute("ALTER TABLE usuarios ADD COLUMN estado TEXT NOT NULL DEFAULT 'pendiente'");
    estadoNuevo = true;
  } catch (err) {
    // la columna estado ya existe
  }
  if (estadoNuevo) {
    await db.execute("UPDATE usuarios SET estado = CASE WHEN confirmado = 1 THEN 'activo' ELSE 'pendiente' END");
    console.log('[datos] Migración: columna confirmado convertida en estado');
  }

  // El rol `usuario` del Sprint 1 se llama `profesional` desde el Sprint 2
  await db.execute("UPDATE usuarios SET rol = 'profesional' WHERE rol = 'usuario'");

  // --- Catálogos (Sprint 2) ---
  // nombre_normalizado guarda el nombre sin mayúsculas ni tildes: el índice UNIQUE aplica RN-05
  await db.execute(`
    CREATE TABLE IF NOT EXISTS sectores (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nombre TEXT NOT NULL,
      nombre_normalizado TEXT NOT NULL UNIQUE,
      activo INTEGER NOT NULL DEFAULT 1
    )
  `);
  await db.execute(`
    CREATE TABLE IF NOT EXISTS ciudades (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nombre TEXT NOT NULL,
      provincia TEXT NOT NULL,
      nombre_normalizado TEXT NOT NULL,
      UNIQUE (nombre, provincia)
    )
  `);

  // --- Perfil del profesional (Sprint 2) ---
  // Un perfil por usuario; sectores (con especialidad) y ciudades en tablas de unión
  await db.execute(`
    CREATE TABLE IF NOT EXISTS perfiles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      usuario_id INTEGER NOT NULL UNIQUE REFERENCES usuarios(id),
      nombre_comercial TEXT NOT NULL,
      descripcion TEXT,
      telefono TEXT,
      email_contacto TEXT,
      web TEXT,
      whatsapp TEXT,
      actualizado INTEGER NOT NULL
    )
  `);
  await db.execute(`
    CREATE TABLE IF NOT EXISTS perfil_sectores (
      perfil_id INTEGER NOT NULL REFERENCES perfiles(id),
      sector_id INTEGER NOT NULL REFERENCES sectores(id),
      especialidad TEXT NOT NULL,
      PRIMARY KEY (perfil_id, sector_id)
    )
  `);
  await db.execute(`
    CREATE TABLE IF NOT EXISTS perfil_ciudades (
      perfil_id INTEGER NOT NULL REFERENCES perfiles(id),
      ciudad_id INTEGER NOT NULL REFERENCES ciudades(id),
      PRIMARY KEY (perfil_id, ciudad_id)
    )
  `);

  // Servicios del profesional (RF-14). Los importes se guardan en céntimos para no arrastrar
  // errores de redondeo de los decimales (D-25). tipo_precio admite los cinco tipos de la
  // especificación más el presupuesto cerrado (D-26)
  await db.execute(`
    CREATE TABLE IF NOT EXISTS servicios (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      perfil_id INTEGER NOT NULL REFERENCES perfiles(id),
      sector_id INTEGER NOT NULL REFERENCES sectores(id),
      titulo TEXT NOT NULL,
      descripcion TEXT,
      tipo_precio TEXT NOT NULL CHECK (tipo_precio IN ('fijo', 'hora', 'unidad', 'desde', 'consultar', 'presupuesto')),
      importe_centimos INTEGER,
      unidad TEXT,
      iva_incluido INTEGER,
      presupuesto_gratis INTEGER,
      visita_centimos INTEGER,
      actualizado INTEGER NOT NULL
    )
  `);

  // Imágenes del profesional: logo (como mucho uno) y fotos de sus trabajos.
  // Se guardan en la base de datos porque el disco de Cloud Run se borra en cada despliegue (D-24)
  await db.execute(`
    CREATE TABLE IF NOT EXISTS imagenes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      usuario_id INTEGER NOT NULL REFERENCES usuarios(id),
      tipo TEXT NOT NULL CHECK (tipo IN ('logo', 'trabajo')),
      mime TEXT NOT NULL,
      datos BLOB NOT NULL,
      creada INTEGER NOT NULL
    )
  `);

  // Los sectores iniciales solo se cargan si la tabla está vacía, para respetar los cambios del administrador
  const { rows } = await db.execute('SELECT COUNT(*) AS total FROM sectores');
  if (Number(rows[0][0]) === 0) {
    await insertarVarios('sectores', ['nombre', 'nombre_normalizado'],
      SECTORES_INICIALES.map((nombre) => [nombre, normalizar(nombre)]));
  }

  // Las ciudades se insertan siempre con OR IGNORE: añadir una ciudad al catálogo solo requiere desplegar
  await insertarVarios('ciudades', ['nombre', 'provincia', 'nombre_normalizado'],
    CIUDADES.map(([nombre, provincia]) => [nombre, provincia, normalizar(nombre)]), 'INSERT OR IGNORE');
}

// Inserta muchas filas en una sola sentencia (una sola petición a Turso)
async function insertarVarios(tabla, columnas, filas, verbo = 'INSERT') {
  if (filas.length === 0) return;
  const huecos = `(${columnas.map(() => '?').join(', ')})`;
  await db.execute({
    sql: `${verbo} INTO ${tabla} (${columnas.join(', ')}) VALUES ${filas.map(() => huecos).join(', ')}`,
    args: filas.flat()
  });
}

const listo = inicializar();
listo.catch((err) => console.error('[datos] No se pudo inicializar la base de datos:', err.message));

// Ejecuta una consulta esperando a que la base esté inicializada
async function consultar(sql, args = []) {
  await listo;
  return db.execute({ sql, args });
}

// Convierte las filas de libSQL en objetos planos { columna: valor }
function aObjetos(resultado) {
  return resultado.rows.map((fila) =>
    Object.fromEntries(resultado.columns.map((columna, i) => [columna, fila[i]]))
  );
}

// Columnas que se devuelven de un usuario (la columna antigua `confirmado`, si existe, se ignora)
const COLUMNAS = 'id, email, password, rol, estado, token_confirmacion, token_expira';

function aSector(fila) {
  if (!fila) return null;
  return { id: fila.id, nombre: fila.nombre, activo: Boolean(fila.activo) };
}

async function buscarUno(sql, args) {
  const resultado = await consultar(sql, args);
  return aObjetos(resultado)[0] || null;
}

module.exports = {
  guardar: async (usuario) => {
    const resultado = await consultar(
      'INSERT INTO usuarios (email, password, rol, estado, token_confirmacion, token_expira) VALUES (?, ?, ?, ?, ?, ?)',
      [
        usuario.email,
        usuario.password,
        usuario.rol || 'profesional',
        usuario.estado || 'pendiente',
        usuario.tokenConfirmacion || null,
        usuario.tokenExpira || null
      ]
    );
    return {
      id: Number(resultado.lastInsertRowid),
      email: usuario.email,
      rol: usuario.rol || 'profesional',
      estado: usuario.estado || 'pendiente'
    };
  },

  buscarPorId: async (id) => {
    return buscarUno(`SELECT ${COLUMNAS} FROM usuarios WHERE id = ?`, [id]);
  },

  buscarPorEmail: async (email) => {
    return buscarUno(`SELECT ${COLUMNAS} FROM usuarios WHERE email = ?`, [email]);
  },

  buscarPorTokenConfirmacion: async (token) => {
    return buscarUno(`SELECT ${COLUMNAS} FROM usuarios WHERE token_confirmacion = ?`, [token]);
  },

  // Marca la cuenta como activa y anula el token para que no se pueda reutilizar
  confirmar: async (id) => {
    await consultar(
      "UPDATE usuarios SET estado = 'activo', token_confirmacion = NULL, token_expira = NULL WHERE id = ?",
      [id]
    );
  },

  // Borrado lógico (RN-08): la fila se conserva, pero la cuenta deja de poder usarse
  marcarEliminado: async (id) => {
    await consultar(
      "UPDATE usuarios SET estado = 'eliminado', token_confirmacion = NULL, token_expira = NULL WHERE id = ?",
      [id]
    );
  },

  // Reactivación de una cuenta eliminada (RN-11): misma fila, datos nuevos y pendiente de confirmar
  reactivar: async (id, usuario) => {
    await consultar(
      "UPDATE usuarios SET password = ?, rol = ?, estado = 'pendiente', token_confirmacion = ?, token_expira = ? WHERE id = ?",
      [usuario.password, usuario.rol || 'profesional', usuario.tokenConfirmacion, usuario.tokenExpira, id]
    );
  },

  // Borrado físico: solo para deshacer un alta cuyo correo no se pudo enviar
  eliminarPorEmail: async (email) => {
    await consultar('DELETE FROM usuarios WHERE email = ?', [email]);
  },

  obtenerTodos: async () => {
    const resultado = await consultar('SELECT id, email, rol, estado FROM usuarios ORDER BY id');
    return aObjetos(resultado);
  },

  // --- Sectores ---

  listarSectores: async (soloActivos) => {
    const filtro = soloActivos ? 'WHERE activo = 1' : '';
    const resultado = await consultar(`SELECT id, nombre, activo FROM sectores ${filtro} ORDER BY nombre`);
    return aObjetos(resultado).map(aSector);
  },

  buscarSectorPorId: async (id) => {
    return aSector(await buscarUno('SELECT id, nombre, activo FROM sectores WHERE id = ?', [id]));
  },

  buscarSectorPorNombreNormalizado: async (normalizado) => {
    return aSector(await buscarUno('SELECT id, nombre, activo FROM sectores WHERE nombre_normalizado = ?', [normalizado]));
  },

  crearSector: async ({ nombre, normalizado }) => {
    const resultado = await consultar(
      'INSERT INTO sectores (nombre, nombre_normalizado) VALUES (?, ?)',
      [nombre, normalizado]
    );
    return { id: Number(resultado.lastInsertRowid), nombre, activo: true };
  },

  renombrarSector: async (id, { nombre, normalizado }) => {
    await consultar('UPDATE sectores SET nombre = ?, nombre_normalizado = ? WHERE id = ?', [nombre, normalizado, id]);
  },

  cambiarActivoSector: async (id, activo) => {
    await consultar('UPDATE sectores SET activo = ? WHERE id = ?', [activo ? 1 : 0, id]);
  },

  // --- Ciudades ---

  // Busca por nombre normalizado; primero las que empiezan por el texto, luego las que lo contienen
  buscarCiudades: async (textoNormalizado, limite) => {
    const escapado = textoNormalizado.replace(/[\\%_]/g, (c) => '\\' + c);
    const resultado = await consultar(
      `SELECT id, nombre, provincia FROM ciudades
       WHERE nombre_normalizado LIKE ? ESCAPE '\\'
       ORDER BY CASE WHEN nombre_normalizado LIKE ? ESCAPE '\\' THEN 0 ELSE 1 END, nombre
       LIMIT ?`,
      [`%${escapado}%`, `${escapado}%`, limite]
    );
    return aObjetos(resultado);
  },

  buscarCiudadPorId: async (id) => {
    return buscarUno('SELECT id, nombre, provincia FROM ciudades WHERE id = ?', [id]);
  },

  // --- Perfil del profesional ---

  buscarPerfilPorUsuario: async (usuarioId) => {
    return buscarUno(
      `SELECT id, usuario_id, nombre_comercial, descripcion, telefono, email_contacto, web, whatsapp, actualizado
       FROM perfiles WHERE usuario_id = ?`,
      [usuarioId]
    );
  },

  // Crea el perfil o actualiza sus datos básicos; devuelve el id del perfil
  guardarPerfil: async (usuarioId, perfil) => {
    await consultar(
      `INSERT INTO perfiles (usuario_id, nombre_comercial, descripcion, telefono, email_contacto, web, whatsapp, actualizado)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (usuario_id) DO UPDATE SET
         nombre_comercial = excluded.nombre_comercial, descripcion = excluded.descripcion,
         telefono = excluded.telefono, email_contacto = excluded.email_contacto,
         web = excluded.web, whatsapp = excluded.whatsapp, actualizado = excluded.actualizado`,
      [usuarioId, perfil.nombreComercial, perfil.descripcion, perfil.telefono,
        perfil.emailContacto, perfil.web, perfil.whatsapp, Date.now()]
    );
    const { id } = await buscarUno('SELECT id FROM perfiles WHERE usuario_id = ?', [usuarioId]);
    return id;
  },

  sectoresDePerfil: async (perfilId) => {
    const resultado = await consultar(
      `SELECT s.id, s.nombre, s.activo, ps.especialidad
       FROM perfil_sectores ps JOIN sectores s ON s.id = ps.sector_id
       WHERE ps.perfil_id = ? ORDER BY s.nombre`,
      [perfilId]
    );
    return aObjetos(resultado).map((f) => ({ ...f, activo: Boolean(f.activo) }));
  },

  ciudadesDePerfil: async (perfilId) => {
    const resultado = await consultar(
      `SELECT c.id, c.nombre, c.provincia
       FROM perfil_ciudades pc JOIN ciudades c ON c.id = pc.ciudad_id
       WHERE pc.perfil_id = ? ORDER BY c.nombre`,
      [perfilId]
    );
    return aObjetos(resultado);
  },

  // Sustituye la lista completa de sectores del perfil: [{ sectorId, especialidad }]
  reemplazarSectoresPerfil: async (perfilId, sectores) => {
    await consultar('DELETE FROM perfil_sectores WHERE perfil_id = ?', [perfilId]);
    await insertarVarios('perfil_sectores', ['perfil_id', 'sector_id', 'especialidad'],
      sectores.map((s) => [perfilId, s.sectorId, s.especialidad]));
  },

  // Sustituye la lista completa de ciudades del perfil: [ciudadId]
  reemplazarCiudadesPerfil: async (perfilId, ciudadIds) => {
    await consultar('DELETE FROM perfil_ciudades WHERE perfil_id = ?', [perfilId]);
    await insertarVarios('perfil_ciudades', ['perfil_id', 'ciudad_id'],
      ciudadIds.map((id) => [perfilId, id]));
  },

  // Borra el perfil y sus listas (al reactivar una cuenta eliminada, D-17)
  borrarPerfilDeUsuario: async (usuarioId) => {
    const perfil = await buscarUno('SELECT id FROM perfiles WHERE usuario_id = ?', [usuarioId]);
    if (!perfil) return;
    await consultar('DELETE FROM servicios WHERE perfil_id = ?', [perfil.id]);
    await consultar('DELETE FROM perfil_sectores WHERE perfil_id = ?', [perfil.id]);
    await consultar('DELETE FROM perfil_ciudades WHERE perfil_id = ?', [perfil.id]);
    await consultar('DELETE FROM perfiles WHERE id = ?', [perfil.id]);
  },

  // --- Servicios ---

  serviciosDePerfil: async (perfilId) => {
    const resultado = await consultar(
      `SELECT sv.*, s.nombre AS sector_nombre, s.activo AS sector_activo
       FROM servicios sv JOIN sectores s ON s.id = sv.sector_id
       WHERE sv.perfil_id = ? ORDER BY sv.id`,
      [perfilId]
    );
    return aObjetos(resultado);
  },

  // Servicio junto con el usuario dueño del perfil (para comprobar RN-02)
  buscarServicio: async (id) => {
    return buscarUno(
      `SELECT sv.*, p.usuario_id FROM servicios sv JOIN perfiles p ON p.id = sv.perfil_id WHERE sv.id = ?`,
      [id]
    );
  },

  crearServicio: async (perfilId, s) => {
    const resultado = await consultar(
      `INSERT INTO servicios (perfil_id, sector_id, titulo, descripcion, tipo_precio, importe_centimos,
         unidad, iva_incluido, presupuesto_gratis, visita_centimos, actualizado)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [perfilId, s.sectorId, s.titulo, s.descripcion, s.tipoPrecio, s.importeCentimos,
        s.unidad, s.ivaIncluido, s.presupuestoGratis, s.visitaCentimos, Date.now()]
    );
    return Number(resultado.lastInsertRowid);
  },

  actualizarServicio: async (id, s) => {
    await consultar(
      `UPDATE servicios SET sector_id = ?, titulo = ?, descripcion = ?, tipo_precio = ?, importe_centimos = ?,
         unidad = ?, iva_incluido = ?, presupuesto_gratis = ?, visita_centimos = ?, actualizado = ?
       WHERE id = ?`,
      [s.sectorId, s.titulo, s.descripcion, s.tipoPrecio, s.importeCentimos,
        s.unidad, s.ivaIncluido, s.presupuestoGratis, s.visitaCentimos, Date.now(), id]
    );
  },

  borrarServicio: async (id) => {
    await consultar('DELETE FROM servicios WHERE id = ?', [id]);
  },

  // RN-03: al quitar sectores del perfil se borran sus servicios
  borrarServiciosDeSectores: async (perfilId, sectorIds) => {
    for (const sectorId of sectorIds) {
      await consultar('DELETE FROM servicios WHERE perfil_id = ? AND sector_id = ?', [perfilId, sectorId]);
    }
  },

  // --- Imágenes (logo y fotos de trabajos) ---

  // Solo los datos de cada imagen, sin el contenido binario
  imagenesDeUsuario: async (usuarioId) => {
    const resultado = await consultar(
      'SELECT id, tipo FROM imagenes WHERE usuario_id = ? ORDER BY id',
      [usuarioId]
    );
    return aObjetos(resultado);
  },

  guardarImagen: async ({ usuarioId, tipo, mime, datos }) => {
    const resultado = await consultar(
      'INSERT INTO imagenes (usuario_id, tipo, mime, datos, creada) VALUES (?, ?, ?, ?, ?)',
      [usuarioId, tipo, mime, datos, Date.now()]
    );
    return Number(resultado.lastInsertRowid);
  },

  // Imagen completa junto con el estado de su dueño (para no servir las de cuentas eliminadas)
  buscarImagen: async (id) => {
    const imagen = await buscarUno(
      `SELECT i.id, i.usuario_id, i.tipo, i.mime, i.datos, u.estado
       FROM imagenes i JOIN usuarios u ON u.id = i.usuario_id WHERE i.id = ?`,
      [id]
    );
    if (imagen) imagen.datos = Buffer.from(imagen.datos);
    return imagen;
  },

  borrarImagen: async (id) => {
    await consultar('DELETE FROM imagenes WHERE id = ?', [id]);
  },

  borrarLogo: async (usuarioId) => {
    await consultar("DELETE FROM imagenes WHERE usuario_id = ? AND tipo = 'logo'", [usuarioId]);
  },

  borrarImagenesDeUsuario: async (usuarioId) => {
    await consultar('DELETE FROM imagenes WHERE usuario_id = ?', [usuarioId]);
  },

  // Solo para las pruebas: vacía los datos (las ciudades son un catálogo fijo)
  limpiar: async () => {
    await consultar('DELETE FROM servicios');
    await consultar('DELETE FROM imagenes');
    await consultar('DELETE FROM perfil_sectores');
    await consultar('DELETE FROM perfil_ciudades');
    await consultar('DELETE FROM perfiles');
    await consultar('DELETE FROM usuarios');
    await consultar('DELETE FROM sectores');
  }
};
