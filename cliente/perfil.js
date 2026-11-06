// «Mi perfil» del profesional: carga, edición y guardado del perfil (RF-11, RF-12, RF-13),
// con una vista previa de la ficha y el progreso de lo que falta por completar.
document.addEventListener('DOMContentLoaded', async () => {
  const token = localStorage.getItem('jwt_token');
  const userInfo = document.getElementById('user-info');
  const mensajeDiv = document.getElementById('mensaje');
  const form = document.getElementById('form-perfil');
  const campos = {
    nombreComercial: document.getElementById('nombre-comercial'),
    descripcion: document.getElementById('descripcion'),
    telefono: document.getElementById('telefono'),
    whatsapp: document.getElementById('whatsapp'),
    emailContacto: document.getElementById('email-contacto'),
    web: document.getElementById('web')
  };
  const contenedorSectores = document.getElementById('lista-sectores');
  const inputCiudad = document.getElementById('buscar-ciudad');
  const listaSugerencias = document.getElementById('sugerencias');
  const contenedorCiudades = document.getElementById('ciudades-elegidas');
  const MAX_CIUDADES = 50;
  const MAX_FOTOS = 8;
  const MAX_BYTES_IMAGEN = 600 * 1024;
  let ciudadesElegidas = []; // [{ id, nombre, provincia }]
  let logo = null;           // { id, url } o null
  let fotos = [];            // [{ id, url }]

  function cerrarSesion() {
    localStorage.removeItem('jwt_token');
    localStorage.removeItem('rol');
    window.location.href = '/index.html';
  }

  function mostrarMensaje(texto, esExito = false, desplazar = true) {
    mensajeDiv.style.display = 'block';
    mensajeDiv.textContent = texto;
    mensajeDiv.classList.toggle('alert-exito', esExito);
    if (desplazar) mensajeDiv.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  async function peticion(metodo, ruta, cuerpo) {
    const opciones = { method: metodo, headers: { 'Authorization': `Bearer ${token}` } };
    if (cuerpo !== undefined) {
      opciones.headers['Content-Type'] = 'application/json';
      opciones.body = JSON.stringify(cuerpo);
    }
    const res = await fetch(ruta, opciones);
    const data = await res.json();
    if (res.status === 401) cerrarSesion();
    if (!res.ok) throw new Error(data.error || 'Error en la petición');
    return data;
  }

  document.getElementById('btn-logout').addEventListener('click', cerrarSesion);

  // RF-09: el profesional elimina su propia cuenta (borrado lógico)
  document.getElementById('btn-eliminar').addEventListener('click', async () => {
    if (!confirm('¿Seguro que quieres eliminar tu cuenta? Podrás volver a registrarte con el mismo correo.')) return;
    try {
      await peticion('DELETE', '/api/usuarios/me');
      localStorage.removeItem('jwt_token');
      localStorage.removeItem('rol');
      window.location.href = '/index.html?cuenta=eliminada';
    } catch (error) {
      mostrarMensaje(error.message);
    }
  });

  if (!token) {
    window.location.href = '/index.html';
    return;
  }

  // --- Sectores: casillas con su especialidad ---

  function pintarSectores(sectoresActivos, sectoresDelPerfil) {
    const delPerfil = new Map(sectoresDelPerfil.map(s => [s.id, s]));
    // Activos del catálogo + los que ya tenía el profesional aunque se hayan desactivado
    const todos = [...sectoresActivos];
    sectoresDelPerfil.forEach(s => { if (!todos.some(a => a.id === s.id)) todos.push(s); });
    todos.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));

    contenedorSectores.replaceChildren();
    if (todos.length === 0) {
      contenedorSectores.innerHTML = '<p class="ayuda">Todavía no hay sectores disponibles.</p>';
      return;
    }
    todos.forEach(sector => {
      const elegido = delPerfil.get(sector.id);
      const fila = document.createElement('div');
      fila.className = sector.activo === false ? 'sector no-disponible' : 'sector';
      fila.dataset.id = sector.id;
      fila.dataset.nombre = sector.nombre;

      const etiqueta = document.createElement('label');
      etiqueta.className = 'casilla';
      const casilla = document.createElement('input');
      casilla.type = 'checkbox';
      casilla.checked = Boolean(elegido);
      const nombre = document.createElement('span');
      nombre.textContent = sector.activo === false ? `${sector.nombre} (ya no se ofrece)` : sector.nombre;
      etiqueta.append(casilla, nombre);

      const especialidad = document.createElement('input');
      especialidad.type = 'text';
      especialidad.maxLength = 150;
      especialidad.placeholder = 'Tu especialidad';
      especialidad.setAttribute('aria-label', `Especialidad en ${sector.nombre}`);
      especialidad.value = elegido ? elegido.especialidad : '';
      especialidad.hidden = !elegido;

      casilla.addEventListener('change', () => {
        especialidad.hidden = !casilla.checked;
        if (casilla.checked) especialidad.focus();
      });
      fila.append(etiqueta, especialidad);
      contenedorSectores.appendChild(fila);
    });
  }

  function sectoresDelFormulario() {
    return [...contenedorSectores.querySelectorAll('.sector')]
      .filter(fila => fila.querySelector('input[type=checkbox]').checked)
      .map(fila => ({
        sectorId: Number(fila.dataset.id),
        nombre: fila.dataset.nombre,
        especialidad: fila.querySelector('input[type=text]').value
      }));
  }

  // --- Ciudades: autocompletado y lista de elegidas ---

  function pintarCiudades() {
    contenedorCiudades.replaceChildren();
    if (ciudadesElegidas.length === 0) {
      contenedorCiudades.innerHTML = '<p class="ayuda">Todavía no has añadido ninguna ciudad.</p>';
    }
    ciudadesElegidas.forEach(ciudad => {
      const chip = document.createElement('span');
      chip.className = 'chip';
      chip.textContent = `${ciudad.nombre} (${ciudad.provincia})`;
      const quitar = document.createElement('button');
      quitar.type = 'button';
      quitar.textContent = '×';
      quitar.title = `Quitar ${ciudad.nombre}`;
      quitar.addEventListener('click', () => {
        ciudadesElegidas = ciudadesElegidas.filter(c => c.id !== ciudad.id);
        pintarCiudades();
      });
      chip.appendChild(quitar);
      contenedorCiudades.appendChild(chip);
    });
    pintarVistaPrevia();
  }

  function anadirCiudad(ciudad) {
    if (ciudadesElegidas.some(c => c.id === ciudad.id)) {
      mostrarMensaje(`${ciudad.nombre} ya está en tu zona de actuación`);
    } else if (ciudadesElegidas.length >= MAX_CIUDADES) {
      mostrarMensaje(`Puedes elegir como máximo ${MAX_CIUDADES} ciudades`);
    } else {
      ciudadesElegidas.push(ciudad);
      ciudadesElegidas.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
      pintarCiudades();
    }
    inputCiudad.value = '';
    cerrarSugerencias();
    inputCiudad.focus();
  }

  function cerrarSugerencias() {
    listaSugerencias.hidden = true;
    listaSugerencias.replaceChildren();
  }

  let esperaBusqueda;
  let ultimaBusqueda = 0;
  inputCiudad.addEventListener('input', () => {
    clearTimeout(esperaBusqueda);
    const texto = inputCiudad.value.trim();
    if (texto.length < 2) return cerrarSugerencias();
    esperaBusqueda = setTimeout(async () => {
      const numero = ++ultimaBusqueda;
      try {
        const res = await fetch(`/api/ciudades?q=${encodeURIComponent(texto)}`);
        const ciudades = await res.json();
        if (numero !== ultimaBusqueda) return; // llegó tarde una búsqueda anterior
        listaSugerencias.replaceChildren();
        if (ciudades.length === 0) {
          const vacio = document.createElement('li');
          vacio.className = 'sin-resultados';
          vacio.textContent = 'No hay ninguna ciudad con ese nombre';
          listaSugerencias.appendChild(vacio);
        }
        ciudades.forEach(ciudad => {
          const opcion = document.createElement('li');
          opcion.setAttribute('role', 'option');
          opcion.textContent = `${ciudad.nombre} (${ciudad.provincia})`;
          opcion.addEventListener('mousedown', (e) => { e.preventDefault(); anadirCiudad(ciudad); });
          listaSugerencias.appendChild(opcion);
        });
        listaSugerencias.hidden = false;
      } catch (error) {
        cerrarSugerencias();
      }
    }, 200);
  });
  // Enter añade la primera sugerencia en lugar de enviar el formulario
  inputCiudad.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const primera = listaSugerencias.querySelector('li[role=option]');
      if (primera) primera.dispatchEvent(new MouseEvent('mousedown'));
    } else if (e.key === 'Escape') {
      cerrarSugerencias();
    }
  });
  inputCiudad.addEventListener('blur', () => setTimeout(cerrarSugerencias, 150));

  // --- Logo y fotos de trabajos (RF-23) ---

  // Reduce la imagen en el navegador antes de subirla: menos espacio en la base de datos y subidas rápidas
  async function prepararImagen(archivo, ladoMaximo, formato) {
    let mapa;
    try {
      mapa = await createImageBitmap(archivo);
    } catch (error) {
      throw new Error(`No se pudo leer «${archivo.name}». Usa una imagen JPG, PNG o WebP.`);
    }
    const escala = Math.min(1, ladoMaximo / Math.max(mapa.width, mapa.height));
    const lienzo = document.createElement('canvas');
    lienzo.width = Math.round(mapa.width * escala);
    lienzo.height = Math.round(mapa.height * escala);
    const contexto = lienzo.getContext('2d');
    if (formato === 'image/jpeg') {
      contexto.fillStyle = '#FFFFFF'; // JPG no tiene transparencia
      contexto.fillRect(0, 0, lienzo.width, lienzo.height);
    }
    contexto.drawImage(mapa, 0, 0, lienzo.width, lienzo.height);
    const aBlob = (tipo, calidad) => new Promise(resolver => lienzo.toBlob(resolver, tipo, calidad));

    let calidad = 0.85;
    let blob = await aBlob(formato, calidad);
    if (!blob || blob.type !== formato) blob = await aBlob('image/png'); // navegador sin WebP
    while (blob.size > MAX_BYTES_IMAGEN && calidad > 0.45 && blob.type !== 'image/png') {
      calidad -= 0.1;
      blob = await aBlob(blob.type, calidad);
    }
    if (blob.size > MAX_BYTES_IMAGEN) {
      throw new Error(`«${archivo.name}» es demasiado grande incluso reducida. Prueba con otra imagen.`);
    }
    return blob;
  }

  async function subirImagen(metodo, ruta, blob) {
    const res = await fetch(ruta, {
      method: metodo,
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': blob.type },
      body: blob
    });
    const data = await res.json();
    if (res.status === 401) cerrarSesion();
    if (!res.ok) throw new Error(data.error || 'No se pudo subir la imagen');
    return data;
  }

  // Iniciales del nombre comercial, para cuando no hay logo
  function iniciales() {
    const palabras = campos.nombreComercial.value.trim().split(/\s+/).filter(p => p.length > 2 || /^[A-ZÁÉÍÓÚÑ]/.test(p));
    return palabras.slice(0, 2).map(p => p[0].toUpperCase()).join('');
  }

  function pintarLogoEn(contenedor) {
    contenedor.replaceChildren();
    contenedor.classList.toggle('con-imagen', Boolean(logo));
    if (logo) {
      const img = document.createElement('img');
      img.src = logo.url;
      img.alt = 'Logo';
      contenedor.appendChild(img);
    } else {
      contenedor.textContent = iniciales();
    }
  }

  function pintarLogo() {
    pintarLogoEn(document.getElementById('logo-actual'));
    document.getElementById('boton-logo').textContent = logo ? 'Cambiar logo' : 'Subir logo';
    document.getElementById('quitar-logo').hidden = !logo;
    pintarVistaPrevia();
  }

  function pintarGaleria() {
    const galeria = document.getElementById('galeria');
    galeria.replaceChildren(...fotos.map(foto => {
      const marco = document.createElement('div');
      marco.className = 'foto';
      const img = document.createElement('img');
      img.src = foto.url;
      img.alt = 'Foto de un trabajo';
      img.loading = 'lazy';
      const quitar = document.createElement('button');
      quitar.type = 'button';
      quitar.textContent = '×';
      quitar.title = 'Quitar esta foto';
      quitar.addEventListener('click', () => quitarFoto(foto));
      marco.append(img, quitar);
      return marco;
    }));
    if (fotos.length < MAX_FOTOS) {
      const anadir = document.createElement('label');
      anadir.className = 'anadir-foto';
      anadir.htmlFor = 'archivo-fotos';
      const mas = document.createElement('span');
      mas.textContent = '+';
      anadir.append(mas, fotos.length ? 'Añadir más' : 'Añadir fotos');
      galeria.appendChild(anadir);
    }
    document.getElementById('contador-fotos').textContent =
      `${fotos.length} de ${MAX_FOTOS} fotos. JPG, PNG o WebP; se reducen automáticamente.`;
    pintarVistaPrevia();
  }

  document.getElementById('archivo-logo').addEventListener('change', async (e) => {
    const archivo = e.target.files[0];
    e.target.value = '';
    if (!archivo) return;
    const bloque = document.querySelector('.subida-logo');
    bloque.classList.add('subiendo');
    try {
      const blob = await prepararImagen(archivo, 512, 'image/webp');
      logo = await subirImagen('PUT', '/api/perfil/logo', blob);
      pintarLogo();
      mostrarMensaje('Logo publicado', true);
    } catch (error) {
      mostrarMensaje(error.message);
    } finally {
      bloque.classList.remove('subiendo');
    }
  });

  document.getElementById('quitar-logo').addEventListener('click', async () => {
    if (!confirm('¿Quitar el logo de tu ficha?')) return;
    try {
      await peticion('DELETE', '/api/perfil/logo');
      logo = null;
      pintarLogo();
      mostrarMensaje('Logo quitado', true);
    } catch (error) {
      mostrarMensaje(error.message);
    }
  });

  document.getElementById('archivo-fotos').addEventListener('change', async (e) => {
    const archivos = [...e.target.files];
    e.target.value = '';
    const libres = MAX_FOTOS - fotos.length;
    if (archivos.length > libres) {
      mostrarMensaje(`Solo puedes añadir ${libres} ${libres === 1 ? 'foto más' : 'fotos más'}; se subirán las primeras.`);
    }
    const galeria = document.getElementById('galeria');
    galeria.classList.add('subiendo');
    let subidas = 0;
    try {
      for (const archivo of archivos.slice(0, libres)) {
        const blob = await prepararImagen(archivo, 1600, 'image/jpeg');
        fotos.push(await subirImagen('POST', '/api/perfil/fotos', blob));
        subidas++;
        pintarGaleria();
      }
      if (subidas) mostrarMensaje(subidas === 1 ? 'Foto publicada' : `${subidas} fotos publicadas`, true);
    } catch (error) {
      mostrarMensaje(error.message);
    } finally {
      galeria.classList.remove('subiendo');
      pintarGaleria();
    }
  });

  async function quitarFoto(foto) {
    if (!confirm('¿Quitar esta foto de tu ficha?')) return;
    try {
      await peticion('DELETE', `/api/perfil/fotos/${foto.id}`);
      fotos = fotos.filter(f => f.id !== foto.id);
      pintarGaleria();
    } catch (error) {
      mostrarMensaje(error.message);
    }
  }

  // --- Vista previa de la ficha y progreso ---

  function listaDeCiudades(ciudades) {
    const nombres = ciudades.map(c => c.nombre);
    if (nombres.length <= 3) {
      return nombres.length > 1 ? `${nombres.slice(0, -1).join(', ')} y ${nombres.at(-1)}` : (nombres[0] || '');
    }
    return `${nombres.slice(0, 2).join(', ')} y ${nombres.length - 2} ciudades más`;
  }

  function textoVacio(elemento, texto) {
    const p = document.createElement('p');
    p.className = 'ficha-vacia';
    p.textContent = texto;
    elemento.replaceChildren(p);
  }

  function pintarVistaPrevia() {
    const nombre = campos.nombreComercial.value.trim();
    pintarLogoEn(document.getElementById('previa-logo'));
    if (!logo) pintarLogoEn(document.getElementById('logo-actual'));

    const previaFotos = document.getElementById('previa-fotos');
    previaFotos.hidden = fotos.length === 0;
    previaFotos.replaceChildren(...fotos.slice(0, 3).map((foto, i) => {
      const marco = document.createElement('div');
      const img = document.createElement('img');
      img.src = foto.url;
      img.alt = '';
      marco.appendChild(img);
      if (i === 2 && fotos.length > 3) {
        marco.className = 'mas';
        marco.dataset.mas = `+${fotos.length - 3}`;
      }
      return marco;
    }));
    const previaNombre = document.getElementById('previa-nombre');
    previaNombre.textContent = nombre || 'Tu nombre comercial';
    previaNombre.classList.toggle('vacio', !nombre);

    document.getElementById('previa-zona').textContent = ciudadesElegidas.length
      ? listaDeCiudades(ciudadesElegidas)
      : 'Añade las ciudades donde trabajas';

    const descripcion = document.getElementById('previa-descripcion');
    descripcion.textContent = campos.descripcion.value.trim();
    descripcion.hidden = !descripcion.textContent;

    const sectores = sectoresDelFormulario();
    const previaSectores = document.getElementById('previa-sectores');
    if (sectores.length === 0) {
      textoVacio(previaSectores, 'Elige al menos un sector.');
    } else {
      previaSectores.replaceChildren(...sectores.map(s => {
        const li = document.createElement('li');
        const titulo = document.createElement('strong');
        titulo.textContent = s.nombre;
        const detalle = document.createElement('span');
        detalle.textContent = s.especialidad.trim() || 'Escribe tu especialidad';
        li.append(titulo, detalle);
        return li;
      }));
    }

    const medios = [['telefono', 'Teléfono'], ['whatsapp', 'WhatsApp'], ['emailContacto', 'Correo'], ['web', 'Web']]
      .filter(([clave]) => campos[clave].value.trim())
      .map(([, etiqueta]) => etiqueta);
    const previaContacto = document.getElementById('previa-contacto');
    if (medios.length === 0) {
      textoVacio(previaContacto, 'Añade al menos un medio de contacto.');
    } else {
      previaContacto.replaceChildren(...medios.map(texto => {
        const span = document.createElement('span');
        span.textContent = texto;
        return span;
      }));
    }

    // Progreso: lo que el profesional puede completar en esta página
    const pasos = [
      ['Nombre comercial', Boolean(nombre)],
      ['Contacto', medios.length > 0],
      ['Sectores', sectores.length > 0 && sectores.every(s => s.especialidad.trim())],
      ['Zona de actuación', ciudadesElegidas.length > 0]
    ];
    const hechos = pasos.filter(([, ok]) => ok).length;
    document.getElementById('progreso-titulo').innerHTML = '';
    const titulo = document.getElementById('progreso-titulo');
    titulo.append('Tu ficha: ');
    const cuenta = document.createElement('strong');
    cuenta.textContent = `${hechos} de ${pasos.length}`;
    titulo.append(cuenta, ' apartados completos');
    document.getElementById('progreso-barra').style.width = `${(hechos / pasos.length) * 100}%`;
    document.getElementById('progreso-lista').replaceChildren(...pasos.map(([texto, ok]) => {
      const li = document.createElement('li');
      li.textContent = texto;
      if (ok) li.className = 'hecho';
      return li;
    }));
  }

  form.addEventListener('input', pintarVistaPrevia);
  form.addEventListener('change', pintarVistaPrevia);

  // --- Cargar y guardar ---

  function pintarPerfil(perfil) {
    Object.entries(campos).forEach(([clave, input]) => { input.value = perfil[clave] || ''; });
    document.getElementById('contador-descripcion').textContent = campos.descripcion.value.length;
    ciudadesElegidas = Array.isArray(perfil.ciudades) ? [...perfil.ciudades] : [];
    // Si el servidor no envía imágenes (por ejemplo, una versión anterior), la página sigue funcionando
    logo = perfil.logo || null;
    fotos = Array.isArray(perfil.fotos) ? [...perfil.fotos] : [];
    pintarCiudades();
    pintarLogo();
    pintarGaleria();
    document.getElementById('actualizado').textContent = perfil.actualizado
      ? `Guardado el ${new Date(perfil.actualizado).toLocaleString('es-ES', { dateStyle: 'long', timeStyle: 'short' })}`
      : 'Aún no has guardado tu perfil.';
  }

  campos.descripcion.addEventListener('input', () => {
    document.getElementById('contador-descripcion').textContent = campos.descripcion.value.length;
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const boton = document.getElementById('btn-guardar');
    boton.disabled = true;
    try {
      const cuerpo = Object.fromEntries(Object.entries(campos).map(([clave, input]) => [clave, input.value]));
      cuerpo.sectores = sectoresDelFormulario().map(({ sectorId, especialidad }) => ({ sectorId, especialidad }));
      cuerpo.ciudades = ciudadesElegidas.map(c => c.id);
      const perfil = await peticion('PUT', '/api/perfil', cuerpo);
      const sectores = await peticion('GET', '/api/sectores');
      pintarSectores(sectores, perfil.sectores);
      pintarPerfil(perfil);
      mostrarMensaje('Perfil guardado', true);
    } catch (error) {
      mostrarMensaje(error.message);
    } finally {
      boton.disabled = false;
    }
  });

  try {
    const yo = await peticion('GET', '/api/usuarios/me');
    if (yo.usuario.rol === 'admin') {
      window.location.href = '/admin.html';
      return;
    }
    userInfo.textContent = yo.usuario.email;
    const [perfil, sectores] = await Promise.all([
      peticion('GET', '/api/perfil'),
      peticion('GET', '/api/sectores')
    ]);
    pintarSectores(sectores, perfil.sectores);
    pintarPerfil(perfil);
    if (!perfil.existe) {
      mostrarMensaje('Completa tu perfil para que los clientes puedan encontrarte.', true, false);
    }
  } catch (error) {
    mostrarMensaje(error.message || 'Error al conectar con el servidor');
  }
});
