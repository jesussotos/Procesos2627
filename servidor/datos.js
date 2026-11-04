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
      confirmado INTEGER DEFAULT 0
    )
  `);
});

module.exports = {
  guardar: (usuario) => {
    return new Promise((resolve, reject) => {
      const stmt = db.prepare('INSERT INTO usuarios (email, password, rol, confirmado) VALUES (?, ?, ?, ?)');
      stmt.run(usuario.email, usuario.password, usuario.rol || 'usuario', usuario.confirmado ? 1 : 0, function (err) {
        if (err) return reject(err);
        resolve({ id: this.lastID, email: usuario.email, rol: usuario.rol || 'usuario' });
      });
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

  limpiar: () => {
    return new Promise((resolve, reject) => {
      db.run('DELETE FROM usuarios', [], (err) => {
        if (err) return reject(err);
        resolve();
      });
    });
  }
};