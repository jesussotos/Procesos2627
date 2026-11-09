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

// Tarjeta de un profesional (D-32). Es la misma en la vista previa de «Mi perfil», en los resultados
// del buscador y en la ficha de ejemplo del acceso, para que el profesional vea exactamente lo que
// verá el cliente. Necesita precio.js.
//   datos: { nombreComercial, logo, zona, fotos, totalFotos, descripcion, sectores: [{ nombre, especialidad }],
//            contacto: ['telefono' | 'whatsapp' | 'email' | 'web'], servicios, totalServicios, precioReferencia }
//   opciones.href: si se indica, la tarjeta es un enlace (resultados del buscador)
//   opciones.previa: muestra textos de ayuda donde falta información
const ETIQUETAS_CONTACTO = { telefono: 'Teléfono', whatsapp: 'WhatsApp', email: 'Correo', web: 'Web' };
const SERVICIOS_EN_TARJETA = 3;

function crearTarjeta(datos, { href = null, previa = false } = {}) {
  const crear = (etiqueta, clase, texto) => {
    const elemento = document.createElement(etiqueta);
    if (clase) elemento.className = clase;
    if (texto !== undefined) elemento.textContent = texto;
    return elemento;
  };
  const vacio = (texto) => crear('p', 'ficha-vacia', texto);

  const tarjeta = crear(href ? 'a' : 'article', href ? 'ficha resultado' : 'ficha');
  if (href) tarjeta.href = href;

  // Cabecera: logo o iniciales, nombre y zona
  const cabecera = crear('div', 'ficha-cabecera');
  const logo = crear('div', 'ficha-logo');
  pintarLogo(logo, datos.logo, datos.nombreComercial || '');
  const titulo = crear('div');
  const nombre = crear('h3', 'ficha-nombre', datos.nombreComercial || 'Tu nombre comercial');
  nombre.classList.toggle('vacio', !datos.nombreComercial);
  const zona = crear('p', 'ficha-zona', datos.zona ? `Trabaja en ${datos.zona}` : (previa ? 'Añade las ciudades donde trabajas' : ''));
  titulo.append(nombre, zona);
  cabecera.append(logo, titulo);

  const cuerpo = crear('div', 'ficha-cuerpo');

  // Fotos: tres miniaturas y, si hay más, cuántas quedan
  if (datos.fotos.length) {
    const fotos = crear('div', 'ficha-fotos');
    datos.fotos.slice(0, 3).forEach((foto, i) => {
      const marco = crear('div');
      const img = crear('img');
      img.src = foto.url;
      img.alt = '';
      img.loading = 'lazy';
      marco.appendChild(img);
      if (i === 2 && datos.totalFotos > 3) {
        marco.className = 'mas';
        marco.dataset.mas = `+${datos.totalFotos - 3}`;
      }
      fotos.appendChild(marco);
    });
    cuerpo.appendChild(fotos);
  }

  if (datos.descripcion) cuerpo.appendChild(crear('p', 'ficha-descripcion', datos.descripcion));

  // Oficios con la especialidad del profesional
  if (datos.sectores.length) {
    const lista = crear('ul', 'ficha-sectores');
    datos.sectores.forEach((sector) => {
      const li = crear('li');
      li.append(crear('strong', '', sector.nombre), crear('span', '', sector.especialidad || (previa ? 'Escribe tu especialidad' : '')));
      lista.appendChild(li);
    });
    cuerpo.appendChild(lista);
  } else if (previa) {
    cuerpo.appendChild(vacio('Elige al menos un sector.'));
  }

  // Medios de contacto publicados
  if (datos.contacto.length) {
    const contacto = crear('div', 'ficha-contacto');
    datos.contacto.forEach((medio) => contacto.appendChild(crear('span', '', ETIQUETAS_CONTACTO[medio])));
    cuerpo.appendChild(contacto);
  } else if (previa) {
    cuerpo.appendChild(vacio('Añade al menos un medio de contacto.'));
  }

  // Servicios con su precio
  if (datos.servicios.length) {
    const lista = crear('ul', 'ficha-servicios');
    datos.servicios.slice(0, SERVICIOS_EN_TARJETA).forEach((servicio) => {
      const li = crear('li');
      const precio = crear('span');
      const importe = crear('strong', '', Precio.texto(servicio));
      if (servicio.tipoPrecio === 'presupuesto' && servicio.presupuestoGratis) importe.classList.add('gratis');
      precio.appendChild(importe);
      const iva = Precio.iva(servicio, true);
      if (iva) precio.appendChild(crear('small', '', iva));
      li.append(crear('span', '', servicio.titulo), precio);
      lista.appendChild(li);
    });
    cuerpo.appendChild(lista);
    const resto = datos.totalServicios - Math.min(datos.servicios.length, SERVICIOS_EN_TARJETA);
    if (resto > 0) cuerpo.appendChild(crear('p', 'ficha-mas', `y ${resto} ${resto === 1 ? 'servicio más' : 'servicios más'}`));
  } else if (previa) {
    cuerpo.appendChild(vacio('Tus servicios y precios aparecerán aquí.'));
  }

  // Pie: precio de referencia (apartado 4.4) y acceso a la ficha completa
  const pie = crear('div', 'ficha-pie');
  const referencia = crear('span');
  if (datos.precioReferencia !== null && datos.precioReferencia !== undefined) {
    referencia.append('desde ', crear('strong', '', Precio.euros(datos.precioReferencia)));
  } else if (datos.servicios.some((s) => s.tipoPrecio === 'presupuesto')) {
    referencia.textContent = 'Pide presupuesto';
  } else {
    referencia.textContent = datos.servicios.length ? 'Precio a consultar' : 'Sin precios todavía';
  }
  pie.append(referencia, crear('span', 'ficha-ver', 'Ver ficha'));

  tarjeta.append(cabecera, cuerpo, pie);
  return tarjeta;
}
