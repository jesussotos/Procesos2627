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
  let servicios = [];        // servicios guardados (ver Precio en precio.js)
  let sectoresGuardados = []; // sectores del perfil tal como están en el servidor
  let perfilGuardado = false;
  let editandoServicio = null; // id del servicio que se edita, o null si es nuevo

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
    if (!res.ok) {
      const error = new Error(data.error || 'Error en la petición');
      error.status = res.status;
      error.datos = data;
      throw error;
    }
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

  // --- Servicios (RF-14, RF-15) ---

  const formServicio = document.getElementById('form-servicio');
  const camposServicio = {
    titulo: document.getElementById('servicio-titulo'),
    sector: document.getElementById('servicio-sector'),
    descripcion: document.getElementById('servicio-descripcion'),
    importe: document.getElementById('servicio-importe'),
    unidad: document.getElementById('servicio-unidad'),
    iva: document.getElementById('servicio-iva'),
    gratis: document.getElementById('servicio-gratis'),
    visita: document.getElementById('servicio-visita')
  };
  const ETIQUETAS_IMPORTE = { fijo: 'Precio', hora: 'Precio por hora', unidad: 'Precio por unidad', desde: 'Precio mínimo' };
  const SUFIJOS_IMPORTE = { fijo: '€', hora: '€/hora', unidad: '€', desde: '€' };

  function tipoElegido() {
    return formServicio.querySelector('input[name=tipo-precio]:checked').value;
  }

  // Muestra solo los campos que corresponden al tipo de precio elegido
  function actualizarCamposPrecio() {
    const tipo = tipoElegido();
    formServicio.querySelectorAll('[data-para]').forEach(campo => {
      const para = campo.dataset.para.split(' ');
      const visible = para.includes(tipo) || (para.includes('presupuesto-pago') && tipo === 'presupuesto' && !camposServicio.gratis.checked);
      campo.hidden = !visible;
    });
    if (ETIQUETAS_IMPORTE[tipo]) {
      document.getElementById('etiqueta-importe').textContent = ETIQUETAS_IMPORTE[tipo];
      document.getElementById('sufijo-importe').textContent = SUFIJOS_IMPORTE[tipo];
    }
  }
  formServicio.querySelectorAll('input[name=tipo-precio]').forEach(r => r.addEventListener('change', actualizarCamposPrecio));
  camposServicio.gratis.addEventListener('change', actualizarCamposPrecio);

  // Importe en euros escrito a la española para rellenar el formulario al editar
  const importeEnTexto = (importe) => (importe === null || importe === undefined ? '' : String(importe).replace('.', ','));

  function abrirFormularioServicio(servicio = null) {
    editandoServicio = servicio ? servicio.id : null;
    document.getElementById('form-servicio-titulo').textContent = servicio ? 'Editar servicio' : 'Nuevo servicio';

    // Sectores: los activos del perfil y, al editar, también el del servicio aunque se haya desactivado
    const opciones = sectoresGuardados.filter(s => s.activo !== false || (servicio && s.id === servicio.sectorId));
    camposServicio.sector.replaceChildren(...opciones.map(s => {
      const opcion = document.createElement('option');
      opcion.value = s.id;
      opcion.textContent = s.activo === false ? `${s.nombre} (ya no se ofrece)` : s.nombre;
      return opcion;
    }));

    camposServicio.titulo.value = servicio ? servicio.titulo : '';
    camposServicio.descripcion.value = servicio ? servicio.descripcion : '';
    if (servicio) camposServicio.sector.value = servicio.sectorId;
    const tipo = servicio ? servicio.tipoPrecio : 'fijo';
    formServicio.querySelector(`input[name=tipo-precio][value=${tipo}]`).checked = true;
    camposServicio.importe.value = servicio ? importeEnTexto(servicio.importe) : '';
    camposServicio.unidad.value = servicio && servicio.tipoPrecio === 'unidad' ? servicio.unidad : '';
    camposServicio.iva.checked = servicio ? servicio.ivaIncluido !== false : true;
    camposServicio.gratis.checked = servicio ? servicio.presupuestoGratis !== false : true;
    camposServicio.visita.value = servicio ? importeEnTexto(servicio.precioVisita) : '';
    actualizarCamposPrecio();

    formServicio.hidden = false;
    document.getElementById('nuevo-servicio').hidden = true;
    formServicio.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    camposServicio.titulo.focus();
  }

  function cerrarFormularioServicio() {
    formServicio.hidden = true;
    editandoServicio = null;
    document.getElementById('nuevo-servicio').hidden = false;
  }

  function pintarServicios() {
    const puedeAnadir = perfilGuardado && sectoresGuardados.some(s => s.activo !== false);
    document.getElementById('servicios-aviso').hidden = puedeAnadir;
    document.getElementById('nuevo-servicio').disabled = !puedeAnadir;

    const lista = document.getElementById('lista-servicios');
    if (servicios.length === 0) {
      const vacio = document.createElement('p');
      vacio.className = 'servicios-vacio';
      vacio.textContent = 'Todavía no has añadido servicios. Sin servicios, tu ficha no aparecerá en el buscador.';
      lista.replaceChildren(vacio);
    } else {
      lista.replaceChildren(...servicios.map(servicio => {
        const fila = document.createElement('div');
        fila.className = 'servicio';

        const info = document.createElement('div');
        info.className = 'servicio-info';
        const titulo = document.createElement('strong');
        titulo.textContent = servicio.titulo;
        const sector = document.createElement('span');
        sector.textContent = servicio.sectorActivo === false ? `${servicio.sector} (ya no se ofrece)` : servicio.sector;
        info.append(titulo, sector);

        const precio = document.createElement('div');
        precio.className = 'servicio-precio';
        const importe = document.createElement('strong');
        importe.textContent = Precio.texto(servicio);
        const nota = document.createElement('span');
        nota.textContent = Precio.iva(servicio) || Precio.TIPOS[servicio.tipoPrecio];
        precio.append(importe, nota);

        const acciones = document.createElement('div');
        acciones.className = 'servicio-acciones';
        const editar = document.createElement('button');
        editar.type = 'button';
        editar.className = 'boton-texto';
        editar.textContent = 'Editar';
        editar.addEventListener('click', () => abrirFormularioServicio(servicio));
        const borrar = document.createElement('button');
        borrar.type = 'button';
        borrar.className = 'boton-texto peligro';
        borrar.textContent = 'Borrar';
        borrar.addEventListener('click', () => borrarServicio(servicio));
        acciones.append(editar, borrar);

        fila.append(info, precio, acciones);
        return fila;
      }));
    }
    pintarVistaPrevia();
  }

  document.getElementById('nuevo-servicio').addEventListener('click', () => abrirFormularioServicio());
  document.getElementById('cancelar-servicio').addEventListener('click', cerrarFormularioServicio);

  formServicio.addEventListener('submit', async (e) => {
    e.preventDefault();
    const tipo = tipoElegido();
    const conImporte = Precio.CON_IMPORTE.includes(tipo);
    const cuerpo = {
      sectorId: Number(camposServicio.sector.value),
      titulo: camposServicio.titulo.value,
      descripcion: camposServicio.descripcion.value,
      tipoPrecio: tipo,
      importe: conImporte ? camposServicio.importe.value : null,
      unidad: tipo === 'unidad' ? camposServicio.unidad.value : null,
      ivaIncluido: camposServicio.iva.checked,
      presupuestoGratis: camposServicio.gratis.checked,
      precioVisita: tipo === 'presupuesto' && !camposServicio.gratis.checked ? camposServicio.visita.value : null
    };
    const boton = document.getElementById('guardar-servicio');
    boton.disabled = true;
    try {
      if (editandoServicio) {
        const editado = await peticion('PUT', `/api/perfil/servicios/${editandoServicio}`, cuerpo);
        servicios = servicios.map(s => (s.id === editado.id ? editado : s));
        mostrarMensaje(`Servicio «${editado.titulo}» guardado`, true, false);
      } else {
        const creado = await peticion('POST', '/api/perfil/servicios', cuerpo);
        servicios.push(creado);
        mostrarMensaje(`Servicio «${creado.titulo}» publicado`, true, false);
      }
      cerrarFormularioServicio();
      pintarServicios();
    } catch (error) {
      mostrarMensaje(error.message);
    } finally {
      boton.disabled = false;
    }
  });

  async function borrarServicio(servicio) {
    if (!confirm(`¿Borrar el servicio «${servicio.titulo}»?`)) return;
    try {
      await peticion('DELETE', `/api/perfil/servicios/${servicio.id}`);
      servicios = servicios.filter(s => s.id !== servicio.id);
      if (editandoServicio === servicio.id) cerrarFormularioServicio();
      pintarServicios();
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

    // Servicios: los tres primeros con su precio
    const previaServicios = document.getElementById('previa-servicios');
    if (servicios.length === 0) {
      textoVacio(previaServicios, 'Tus servicios y precios aparecerán aquí.');
    } else {
      const lista = document.createElement('ul');
      lista.className = 'ficha-servicios';
      servicios.slice(0, 3).forEach(servicio => {
        const li = document.createElement('li');
        const titulo = document.createElement('span');
        titulo.textContent = servicio.titulo;
        const precio = document.createElement('span');
        const importe = document.createElement('strong');
        importe.textContent = Precio.texto(servicio);
        if (servicio.tipoPrecio === 'presupuesto' && servicio.presupuestoGratis) importe.className = 'gratis';
        precio.appendChild(importe);
        const iva = Precio.iva(servicio, true);
        if (iva) {
          const nota = document.createElement('small');
          nota.textContent = iva;
          precio.appendChild(nota);
        }
        li.append(titulo, precio);
        lista.appendChild(li);
      });
      const elementos = [lista];
      if (servicios.length > 3) {
        const mas = document.createElement('p');
        mas.className = 'ficha-mas';
        const resto = servicios.length - 3;
        mas.textContent = `y ${resto} ${resto === 1 ? 'servicio más' : 'servicios más'}`;
        elementos.push(mas);
      }
      previaServicios.replaceChildren(...elementos);
    }

    // Progreso: lo que necesita la ficha para poder publicarse (RN-01)
    const pasos = [
      ['Nombre comercial', Boolean(nombre)],
      ['Contacto', medios.length > 0],
      ['Sectores', sectores.length > 0 && sectores.every(s => s.especialidad.trim())],
      ['Zona de actuación', ciudadesElegidas.length > 0],
      ['Servicios', servicios.length > 0]
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
    servicios = Array.isArray(perfil.servicios) ? [...perfil.servicios] : [];
    sectoresGuardados = Array.isArray(perfil.sectores) ? [...perfil.sectores] : [];
    perfilGuardado = Boolean(perfil.existe);
    pintarServicios();
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
      let perfil;
      try {
        perfil = await peticion('PUT', '/api/perfil', cuerpo);
      } catch (error) {
        // RN-03: al quitar sectores con servicios, el servidor pide confirmación antes de borrarlos
        if (error.status !== 409 || !error.datos.servicios) throw error;
        const lista = error.datos.servicios.map(s => `  · ${s.titulo} (${s.sector})`).join('\n');
        if (!confirm(`Al quitar ese sector se borrarán estos servicios:\n\n${lista}\n\n¿Quieres continuar?`)) {
          mostrarMensaje('No se ha guardado el perfil. Vuelve a marcar el sector si quieres conservar sus servicios.');
          return;
        }
        perfil = await peticion('PUT', '/api/perfil', { ...cuerpo, confirmarBorrado: true });
      }
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
