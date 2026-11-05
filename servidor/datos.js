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
      rol TEXT DEFAULT 'usuario',
      confirmado INTEGER DEFAULT 0,
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

function aUsuario(row) {
  if (!row) return null;
  return { ...row, confirmado: Boolean(row.confirmado) };
}

module.exports = {
  guardar: async (usuario) => {
    const resultado = await consultar(
      'INSERT INTO usuarios (email, password, rol, confirmado, token_confirmacion, token_expira) VALUES (?, ?, ?, ?, ?, ?)',
      [
        usuario.email,
        usuario.password,
        usuario.rol || 'usuario',
        usuario.confirmado ? 1 : 0,
        usuario.tokenConfirmacion || null,
        usuario.tokenExpira || null
      ]
    );
    return {
      id: Number(resultado.lastInsertRowid),
      email: usuario.email,
      rol: usuario.rol || 'usuario'
    };
  },

  buscarPorEmail: async (email) => {
    const resultado = await consultar('SELECT * FROM usuarios WHERE email = ?', [email]);
    return aUsuario(aObjetos(resultado)[0]);
  },

  buscarPorTokenConfirmacion: async (token) => {
    const resultado = await consultar('SELECT * FROM usuarios WHERE token_confirmacion = ?', [token]);
    return aUsuario(aObjetos(resultado)[0]);
  },

  // Marca la cuenta como confirmada y anula el token para que no se pueda reutilizar
  confirmar: async (id) => {
    await consultar(
      'UPDATE usuarios SET confirmado = 1, token_confirmacion = NULL, token_expira = NULL WHERE id = ?',
      [id]
    );
  },

  eliminarPorEmail: async (email) => {
    await consultar('DELETE FROM usuarios WHERE email = ?', [email]);
  },

  obtenerTodos: async () => {
    const resultado = await consultar('SELECT id, email, rol, confirmado FROM usuarios');
    return aObjetos(resultado).map((r) => ({ ...r, confirmado: Boolean(r.confirmado) }));
  },

  limpiar: async () => {
    await consultar('DELETE FROM usuarios');
  }
};
