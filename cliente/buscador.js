// Buscador público (RF-17 a RF-20). Los filtros viven en la URL (RNF-13): una búsqueda se puede
// recargar, compartir o recorrer con los botones atrás y adelante del navegador.
document.addEventListener('DOMContentLoaded', async () => {
  const form = document.getElementById('form-busqueda');
  const inputCiudad = document.getElementById('busqueda-ciudad');
  const listaSugerencias = document.getElementById('sugerencias');
  const selectSector = document.getElementById('busqueda-sector');
  const filtroTipo = document.getElementById('filtro-tipo');
  const filtroMax = document.getElementById('filtro-max');
  const filtroOrden = document.getElementById('filtro-orden');
  const mensajeDiv = document.getElementById('mensaje');
  let ciudad = null;   // { id, nombre, provincia } elegida en el autocompletado
  let pagina = 1;
  let sugerencias = [];
  let resaltada = -1;

  function mostrarMensaje(texto) {
    mensajeDiv.style.display = texto ? 'block' : 'none';
    mensajeDiv.textContent = texto || '';
  }

  pintarAccesoBarra();

  // --- Oficios (RF-17): desplegable y atajos ---
  try {
    const sectores = await (await fetch('/api/sectores')).json();
    sectores.forEach(sector => {
      const opcion = document.createElement('option');
      opcion.value = sector.id;
      opcion.textContent = sector.nombre;
      selectSector.appendChild(opcion);
    });
    document.getElementById('atajos-sectores').replaceChildren(...sectores.map(sector => {
      const boton = document.createElement('button');
      boton.type = 'button';
      boton.textContent = sector.nombre;
      boton.addEventListener('click', () => {
        selectSector.value = sector.id;
        document.querySelectorAll('.atajos button').forEach(b => b.setAttribute('aria-pressed', b === boton));
        if (ciudad) {
          buscar(1);
        } else {
          inputCiudad.focus();
          inputCiudad.placeholder = `¿Dónde necesitas ${sector.nombre.toLowerCase()}?`;
        }
      });
      return boton;
    }));
  } catch (error) {
    mostrarMensaje('No se pudieron cargar los oficios. Recarga la página.');
  }

  // --- Ciudad: autocompletado con teclado ---
  const textoCiudad = c => `${c.nombre} (${c.provincia})`;

  function cerrarSugerencias() {
    listaSugerencias.hidden = true;
    listaSugerencias.replaceChildren();
    sugerencias = [];
    resaltada = -1;
  }

  function elegirCiudad(c, buscarYa = false) {
    ciudad = c;
    inputCiudad.value = textoCiudad(c);
    cerrarSugerencias();
    if (buscarYa) buscar(1);
  }

  async function pedirCiudades(texto) {
    const res = await fetch(`/api/ciudades?q=${encodeURIComponent(texto)}`);
    return res.ok ? res.json() : [];
  }

  function pintarSugerencias() {
    listaSugerencias.replaceChildren();
    if (sugerencias.length === 0) {
      const vacio = document.createElement('li');
      vacio.className = 'sin-resultados';
      vacio.textContent = 'No encontramos ninguna ciudad con ese nombre';
      listaSugerencias.appendChild(vacio);
    }
    sugerencias.forEach((c, i) => {
      const opcion = document.createElement('li');
      opcion.setAttribute('role', 'option');
      opcion.setAttribute('aria-selected', i === resaltada);
      opcion.textContent = c.nombre;
      const provincia = document.createElement('small');
      provincia.textContent = c.provincia;
      opcion.appendChild(provincia);
      opcion.addEventListener('mousedown', (e) => { e.preventDefault(); elegirCiudad(c, true); });
      listaSugerencias.appendChild(opcion);
    });
    listaSugerencias.hidden = false;
  }

  let espera;
  let ultimaPeticion = 0;
  inputCiudad.addEventListener('input', () => {
    ciudad = null; // si se edita el texto, hay que volver a elegir
    clearTimeout(espera);
    const texto = inputCiudad.value.trim();
    if (texto.length < 2) return cerrarSugerencias();
    espera = setTimeout(async () => {
      const numero = ++ultimaPeticion;
      const encontradas = await pedirCiudades(texto).catch(() => []);
      if (numero !== ultimaPeticion) return;
      sugerencias = encontradas;
      resaltada = encontradas.length ? 0 : -1;
      pintarSugerencias();
    }, 180);
  });

  inputCiudad.addEventListener('keydown', (e) => {
    if (listaSugerencias.hidden || sugerencias.length === 0) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      resaltada = (resaltada + (e.key === 'ArrowDown' ? 1 : -1) + sugerencias.length) % sugerencias.length;
      pintarSugerencias();
    } else if (e.key === 'Enter' && resaltada >= 0) {
      e.preventDefault();
      elegirCiudad(sugerencias[resaltada], true);
    } else if (e.key === 'Escape') {
      cerrarSugerencias();
    }
  });
  inputCiudad.addEventListener('blur', () => setTimeout(cerrarSugerencias, 150));

  // --- Búsqueda ---

  // Parámetros de la búsqueda actual, sin los vacíos
  function parametros(numeroPagina) {
    const p = new URLSearchParams();
    if (ciudad) p.set('ciudad', ciudad.id);
    if (selectSector.value) p.set('sector', selectSector.value);
    if (filtroTipo.value) p.set('tipo', filtroTipo.value);
    if (filtroMax.value.trim()) p.set('max', filtroMax.value.trim());
    if (filtroOrden.value !== 'precio-asc') p.set('orden', filtroOrden.value);
    if (numeroPagina > 1) p.set('pagina', numeroPagina);
    return p;
  }

  async function buscar(numeroPagina, guardarEnHistorial = true) {
    if (!ciudad) {
      // Si escribió la ciudad pero no la eligió de la lista, se usa la primera que coincida
      const texto = inputCiudad.value.trim();
      const [primera] = texto.length >= 2 ? await pedirCiudades(texto).catch(() => []) : [];
      if (!primera) {
        mostrarMensaje(texto ? 'No encontramos esa ciudad. Elige una de la lista.' : 'Escribe la ciudad donde necesitas el servicio.');
        inputCiudad.focus();
        return;
      }
      elegirCiudad(primera);
    }
    pagina = numeroPagina;
    const consulta = parametros(pagina).toString();
    if (guardarEnHistorial) history.pushState(null, '', `/?${consulta}`);
    await cargar(consulta);
  }

  async function cargar(consulta) {
    mostrarMensaje('');
    document.getElementById('resultados').classList.add('cargando');
    try {
      const res = await fetch(`/api/profesionales?${consulta}`);
      const datos = await res.json();
      if (!res.ok) throw new Error(datos.error || 'No se pudo hacer la búsqueda');
      pintarResultados(datos);
    } catch (error) {
      mostrarMensaje(error.message);
    } finally {
      document.getElementById('resultados').classList.remove('cargando');
    }
  }

  // Rellena el formulario a partir de la URL (al abrir un enlace o al ir atrás y adelante)
  async function leerUrl() {
    const p = new URLSearchParams(location.search);
    selectSector.value = p.get('sector') || '';
    filtroTipo.value = p.get('tipo') || '';
    filtroMax.value = p.get('max') || '';
    filtroOrden.value = p.get('orden') || 'precio-asc';
    pagina = Number(p.get('pagina')) || 1;
    if (p.get('ciudad')) {
      ciudad = { id: Number(p.get('ciudad')) }; // el nombre llega con la respuesta
      await cargar(p.toString());
    } else {
      ciudad = null;
      inputCiudad.value = '';
      document.getElementById('resultados').hidden = true;
      document.getElementById('inicio').hidden = false;
      document.title = 'Oficios · Profesionales a domicilio en tu ciudad';
    }
  }

  form.addEventListener('submit', (e) => { e.preventDefault(); buscar(1); });
  [filtroTipo, filtroOrden, selectSector].forEach(campo => campo.addEventListener('change', () => { if (ciudad) buscar(1); }));
  filtroMax.addEventListener('change', () => { if (ciudad) buscar(1); });
  filtroMax.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); filtroMax.blur(); } });
  document.getElementById('pagina-anterior').addEventListener('click', () => irArriba(buscar(pagina - 1)));
  document.getElementById('pagina-siguiente').addEventListener('click', () => irArriba(buscar(pagina + 1)));
  window.addEventListener('popstate', leerUrl);

  async function irArriba(promesa) {
    await promesa;
    document.getElementById('resultados').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  // --- Resultados ---

  function pintarResultados(datos) {
    ciudad = datos.ciudad;
    inputCiudad.value = textoCiudad(datos.ciudad);
    document.getElementById('inicio').hidden = true;
    document.getElementById('resultados').hidden = false;

    const oficio = datos.sector ? ` de ${datos.sector.nombre.toLowerCase()}` : '';
    document.getElementById('resumen').textContent = datos.total === 0
      ? `Ningún profesional${oficio} en ${datos.ciudad.nombre}`
      : `${datos.total} ${datos.total === 1 ? 'profesional' : 'profesionales'}${oficio} en ${datos.ciudad.nombre}`;
    document.title = `Profesionales${oficio} en ${datos.ciudad.nombre} · Oficios`;

    const lista = document.getElementById('lista-resultados');
    if (datos.resultados.length === 0) {
      lista.replaceChildren(bloqueVacio(datos));
    } else {
      lista.replaceChildren(...datos.resultados.map(r => tarjeta(r, datos.ciudad)));
    }

    const paginacion = document.getElementById('paginacion');
    paginacion.hidden = datos.paginas <= 1;
    document.getElementById('pagina-actual').textContent = `Página ${datos.pagina} de ${datos.paginas}`;
    document.getElementById('pagina-anterior').disabled = datos.pagina <= 1;
    document.getElementById('pagina-siguiente').disabled = datos.pagina >= datos.paginas;
  }

  function bloqueVacio(datos) {
    const bloque = document.createElement('div');
    bloque.className = 'sin-resultados-bloque';
    const texto = document.createElement('p');
    const hayFiltros = datos.filtros.tipo || datos.filtros.max !== null || datos.sector;
    texto.textContent = hayFiltros
      ? 'No hay profesionales que encajen con estos filtros. Prueba a quitar alguno.'
      : `Todavía no hay profesionales publicados en ${datos.ciudad.nombre}. Prueba con una ciudad cercana.`;
    bloque.appendChild(texto);
    if (hayFiltros) {
      const quitar = document.createElement('button');
      quitar.type = 'button';
      quitar.className = 'btn btn-secondary';
      quitar.textContent = 'Quitar filtros';
      quitar.addEventListener('click', () => {
        selectSector.value = '';
        filtroTipo.value = '';
        filtroMax.value = '';
        buscar(1);
      });
      bloque.appendChild(quitar);
    }
    return bloque;
  }

  // Cada resultado es un profesional (apartado 4.4) con los servicios que cumplen los filtros
  function tarjeta(r, ciudadBuscada) {
    const enlace = document.createElement('a');
    enlace.className = 'ficha resultado';
    enlace.href = `/ficha.html?id=${r.id}`;

    const cabecera = document.createElement('div');
    cabecera.className = 'ficha-cabecera';
    const logo = document.createElement('div');
    logo.className = 'ficha-logo';
    pintarLogo(logo, r.logo, r.nombreComercial);
    const titulo = document.createElement('div');
    const nombre = document.createElement('h3');
    nombre.className = 'ficha-nombre';
    nombre.textContent = r.nombreComercial;
    const zona = document.createElement('p');
    zona.className = 'ficha-zona';
    zona.textContent = `Trabaja en ${textoZona(r.ciudades, ciudadBuscada.nombre)}`;
    titulo.append(nombre, zona);
    cabecera.append(logo, titulo);

    const cuerpo = document.createElement('div');
    cuerpo.className = 'ficha-cuerpo';
    const sectores = document.createElement('p');
    sectores.className = 'resultado-sectores';
    sectores.textContent = r.sectores.join(', ');
    const servicios = document.createElement('ul');
    servicios.className = 'ficha-servicios';
    r.servicios.forEach(servicio => {
      const li = document.createElement('li');
      const nombreServicio = document.createElement('span');
      nombreServicio.textContent = servicio.titulo;
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
      li.append(nombreServicio, precio);
      servicios.appendChild(li);
    });
    cuerpo.append(sectores, servicios);
    const resto = r.serviciosCoincidentes - r.servicios.length;
    if (resto > 0) {
      const mas = document.createElement('p');
      mas.className = 'ficha-mas';
      mas.textContent = `y ${resto} ${resto === 1 ? 'servicio más' : 'servicios más'}`;
      cuerpo.appendChild(mas);
    }

    const pie = document.createElement('div');
    pie.className = 'resultado-pie';
    const referencia = document.createElement('span');
    if (r.precioReferencia !== null) {
      referencia.append('desde ');
      const cifra = document.createElement('strong');
      cifra.textContent = Precio.euros(r.precioReferencia);
      referencia.appendChild(cifra);
    } else {
      referencia.textContent = r.servicios.some(s => s.tipoPrecio === 'presupuesto') ? 'Pide presupuesto' : 'Precio a consultar';
    }
    const ver = document.createElement('span');
    ver.textContent = 'Ver ficha';
    pie.append(referencia, ver);

    enlace.append(cabecera, cuerpo, pie);
    return enlace;
  }

  await leerUrl();
});
