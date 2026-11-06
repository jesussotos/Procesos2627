const { createClient } = require('@libsql/client');
const path = require('path');
require('dotenv').config();

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

  limpiar: async () => {
    await consultar('DELETE FROM usuarios');
  }
};
