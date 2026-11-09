// Botón de la barra en las páginas públicas (buscador y ficha): «Acceso profesionales» sin sesión,
// o un acceso directo al panel propio si hay una sesión válida.
async function pintarAccesoBarra() {
  const enlace = document.getElementById('acceso-barra');
  if (!enlace) return;
  enlace.textContent = 'Acceso profesionales';
  enlace.href = '/acceso.html';
  const token = localStorage.getItem('jwt_token');
  if (!token) return;
  try {
    const res = await fetch('/api/usuarios/me', { headers: { 'Authorization': `Bearer ${token}` } });
    if (!res.ok) return;
    const { usuario } = await res.json();
    enlace.textContent = usuario.rol === 'admin' ? 'Administración' : 'Mi perfil';
    enlace.href = usuario.rol === 'admin' ? '/admin.html' : '/dashboard.html';
  } catch (error) {
    // sin conexión: se queda el acceso normal
  }
}

// Enlaces de contacto (RF-21)
const Contacto = {
  telefono: (numero) => `tel:${numero.replace(/[^\d+]/g, '')}`,
  // wa.me necesita el número con prefijo y sin «+»; los móviles españoles de 9 cifras se completan con 34
  whatsapp: (numero) => {
    const cifras = numero.replace(/\D/g, '');
    return `https://wa.me/${cifras.length === 9 ? `34${cifras}` : cifras}`;
  },
  email: (direccion) => `mailto:${direccion}`
};

// Iniciales de un nombre comercial, para cuando el profesional no tiene logo
function inicialesDe(nombre) {
  return nombre.trim().split(/\s+/).filter(p => p.length > 2 || /^[A-ZÁÉÍÓÚÑ]/.test(p))
    .slice(0, 2).map(p => p[0].toUpperCase()).join('');
}

// Logo del profesional o sus iniciales, dentro de un contenedor .ficha-logo
function pintarLogo(contenedor, logo, nombre) {
  contenedor.replaceChildren();
  contenedor.classList.toggle('con-imagen', Boolean(logo));
  if (logo) {
    const img = document.createElement('img');
    img.src = logo.url;
    img.alt = `Logo de ${nombre}`;
    contenedor.appendChild(img);
  } else {
    contenedor.textContent = inicialesDe(nombre);
  }
}

// «Madrid», «Madrid y Getafe», «Madrid, Getafe y 3 ciudades más»
function textoZona(ciudades, primera = null) {
  const nombres = ciudades.map(c => c.nombre);
  if (primera && nombres.includes(primera)) {
    nombres.splice(nombres.indexOf(primera), 1);
    nombres.unshift(primera);
  }
  if (nombres.length <= 2) return nombres.join(' y ');
  if (nombres.length === 3) return `${nombres[0]}, ${nombres[1]} y ${nombres[2]}`;
  return `${nombres[0]}, ${nombres[1]} y ${nombres.length - 2} ciudades más`;
}
