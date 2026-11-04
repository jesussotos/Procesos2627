const sqlite3 = require('sqlite3').verbose();
const path = require('path');
require('dotenv').config();

const dbPath = process.env.DB_PATH || path.join(__dirname, 'database.sqlite');
const db = new sqlite3.Database(dbPath);

// Inicializar la tabla de usuarios si no existe
db.serialize(() => {
  db.run(`
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
  db.run('ALTER TABLE usuarios ADD COLUMN token_confirmacion TEXT', () => {});
  db.run('ALTER TABLE usuarios ADD COLUMN token_expira INTEGER', () => {});
});

function aUsuario(row) {
  if (!row) return null;
  return { ...row, confirmado: Boolean(row.confirmado) };
}

module.exports = {
  guardar: (usuario) => {
    return new Promise((resolve, reject) => {
      const stmt = db.prepare(
        'INSERT INTO usuarios (email, password, rol, confirmado, token_confirmacion, token_expira) VALUES (?, ?, ?, ?, ?, ?)'
      );
      stmt.run(
        usuario.email,
        usuario.password,
        usuario.rol || 'usuario',
        usuario.confirmado ? 1 : 0,
        usuario.tokenConfirmacion || null,
        usuario.tokenExpira || null,
        function (err) {
          if (err) return reject(err);
          resolve({ id: this.lastID, email: usuario.email, rol: usuario.rol || 'usuario' });
        }
      );
      stmt.finalize();
    });
  },

  buscarPorEmail: (email) => {
    return new Promise((resolve, reject) => {
      db.get('SELECT * FROM usuarios WHERE email = ?', [email], (err, row) => {
        if (err) return reject(err);
        resolve(aUsuario(row));
      });
    });
  },

  buscarPorTokenConfirmacion: (token) => {
    return new Promise((resolve, reject) => {
      db.get('SELECT * FROM usuarios WHERE token_confirmacion = ?', [token], (err, row) => {
        if (err) return reject(err);
        resolve(aUsuario(row));
      });
    });
  },

  // Marca la cuenta como confirmada y anula el token para que no se pueda reutilizar
  confirmar: (id) => {
    return new Promise((resolve, reject) => {
      db.run(
        'UPDATE usuarios SET confirmado = 1, token_confirmacion = NULL, token_expira = NULL WHERE id = ?',
        [id],
        (err) => {
          if (err) return reject(err);
          resolve();
        }
      );
    });
  },

  eliminarPorEmail: (email) => {
    return new Promise((resolve, reject) => {
      db.run('DELETE FROM usuarios WHERE email = ?', [email], (err) => {
        if (err) return reject(err);
        resolve();
      });
    });
  },

  obtenerTodos: () => {
    return new Promise((resolve, reject) => {
      db.all('SELECT id, email, rol, confirmado FROM usuarios', [], (err, rows) => {
        if (err) return reject(err);
        resolve(rows.map(r => ({ ...r, confirmado: Boolean(r.confirmado) })));
      });
    });
  },

  limpiar: () => {
    return new Promise((resolve, reject) => {
      db.run('DELETE FROM usuarios', [], (err) => {
        if (err) return reject(err);
        resolve();
      });
    });
  }
};
