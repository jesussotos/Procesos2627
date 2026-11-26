// Regresión de #29: un archivo ignorado por .gitignore sigue estando en el repositorio
// si se subió antes de ignorearlo. Comprobamos el índice de Git, no solo el disco.
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const raiz = path.join(__dirname, '..');
const git = (...args) => execFileSync('git', args, { cwd: raiz, encoding: 'utf8' });

test('No se versionan secretos ni bases de datos locales', () => {
  const versionados = git('ls-files').split(/\r?\n/).filter(Boolean);
  const prohibidos = versionados.filter((archivo) =>
    (/(^|\/)\.env/.test(archivo) && archivo !== '.env.example') ||
    /\.sqlite3?$|\.db$/i.test(archivo)
  );

  expect(prohibidos).toEqual([]);
  expect(() => git('check-ignore', '-q', 'servidor/database.sqlite')).not.toThrow();
});
