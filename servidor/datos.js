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
      confirmation_token_hash TEXT,
      confirmation_expires_at INTEGER
    )
  `);
  db.all('PRAGMA table_info(usuarios)', (err, columns) => {
    if (err) return;
    const names = columns.map((column) => column.name);
    if (!names.includes('confirmation_token_hash')) {
      db.run('ALTER TABLE usuarios ADD COLUMN confirmation_token_hash TEXT');
    }
    if (!names.includes('confirmation_expires_at')) {
      db.run('ALTER TABLE usuarios ADD COLUMN confirmation_expires_at INTEGER');
    }
  });
});

module.exports = {
  guardar: (usuario) => {
    return new Promise((resolve, reject) => {
      const stmt = db.prepare(`
        INSERT INTO usuarios (
          email, password, rol, confirmado, confirmation_token_hash, confirmation_expires_at
        ) VALUES (?, ?, ?, ?, ?, ?)
      `);
      stmt.run(
        usuario.email,
        usuario.password,
        usuario.rol || 'usuario',
        usuario.confirmado ? 1 : 0,
        usuario.confirmationTokenHash || null,
        usuario.confirmationExpiresAt || null,
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
        if (!row) return resolve(null);
        resolve({
          ...row,
          confirmado: Boolean(row.confirmado)
        });
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

  consumirConfirmacion: (tokenHash, ahora) => {
    return new Promise((resolve, reject) => {
      db.get(
        `SELECT id FROM usuarios
         WHERE confirmation_token_hash = ?
           AND confirmation_expires_at > ?
           AND confirmado = 0`,
        [tokenHash, ahora],
        (err, row) => {
          if (err) return reject(err);
          if (!row) return resolve(false);

          db.run(
            `UPDATE usuarios
             SET confirmado = 1,
                 confirmation_token_hash = NULL,
                 confirmation_expires_at = NULL
             WHERE id = ? AND confirmado = 0`,
            [row.id],
            function (updateError) {
              if (updateError) return reject(updateError);
              resolve(this.changes === 1);
            }
          );
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

  limpiar: () => {
    return new Promise((resolve, reject) => {
      db.run('DELETE FROM usuarios', [], (err) => {
        if (err) return reject(err);
        resolve();
      });
    });
  }
};