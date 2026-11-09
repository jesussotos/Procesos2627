// Controles de formulario con el estilo de la web (D-31):
// - Desplegables: cada <select> se acompaña de un botón y un menú verde propios. El <select> original
//   se queda oculto y sigue guardando el valor, así que el resto del código no cambia: leer o asignar
//   select.value, reemplazar sus opciones o escuchar «change» funciona igual que antes.
// - Confirmaciones en el sitio: en vez de la ventana del navegador, el botón se convierte en
//   «¿…? Sí / No» en el mismo lugar.
const Interfaz = (() => {
  const VALOR = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value');
  const INDICE = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'selectedIndex');
  let cerrarAbierto = null; // función para cerrar el desplegable que esté abierto
  let contador = 0;

  function mejorarDesplegable(select) {
    if (select.dataset.mejorado) return;
    select.dataset.mejorado = 'si';
    const id = select.id || `desplegable-${++contador}`;

    const caja = document.createElement('div');
    caja.className = 'desplegable';
    select.parentNode.insertBefore(caja, select);
    caja.appendChild(select);
    select.classList.add('select-oculto');
    select.tabIndex = -1;
    select.setAttribute('aria-hidden', 'true');

    const boton = document.createElement('button');
    boton.type = 'button';
    boton.className = 'desplegable-boton';
    boton.setAttribute('aria-haspopup', 'listbox');
    boton.setAttribute('aria-expanded', 'false');
    boton.setAttribute('aria-controls', `${id}-lista`);
    const texto = document.createElement('span');
    texto.id = `${id}-valor`;
    boton.appendChild(texto);

    const lista = document.createElement('ul');
    lista.className = 'menu-verde desplegable-lista';
    lista.id = `${id}-lista`;
    lista.setAttribute('role', 'listbox');
    lista.hidden = true;
    caja.append(boton, lista);

    // La etiqueta del campo enfoca el botón nuevo y le da nombre accesible
    const etiqueta = select.id ? document.querySelector(`label[for="${select.id}"]`) : null;
    if (etiqueta) {
      etiqueta.id = etiqueta.id || `${id}-etiqueta`;
      boton.setAttribute('aria-labelledby', `${etiqueta.id} ${texto.id}`);
      lista.setAttribute('aria-labelledby', etiqueta.id);
      etiqueta.addEventListener('click', (e) => { e.preventDefault(); boton.focus(); });
    }

    let activa = -1; // opción resaltada con el teclado o el ratón
    const indice = () => INDICE.get.call(select);

    function refrescar() {
      const opcion = select.options[indice()];
      texto.textContent = opcion ? opcion.textContent : '';
      boton.disabled = select.disabled;
      if (!lista.hidden) pintarLista();
    }

    function pintarLista() {
      lista.replaceChildren(...[...select.options].map((opcion, i) => {
        const li = document.createElement('li');
        li.id = `${id}-opcion-${i}`;
        li.setAttribute('role', 'option');
        li.setAttribute('aria-selected', i === indice());
        li.textContent = opcion.textContent;
        li.addEventListener('mousedown', (e) => { e.preventDefault(); elegir(i); });
        li.addEventListener('mousemove', () => { if (activa !== i) { activa = i; resaltar(); } });
        return li;
      }));
      resaltar();
    }

    function resaltar() {
      [...lista.children].forEach((li, i) => li.classList.toggle('activa', i === activa));
      const li = lista.children[activa];
      if (li) {
        boton.setAttribute('aria-activedescendant', li.id);
        // Se desplaza solo la lista (scrollIntoView movería también la página)
        if (li.offsetTop < lista.scrollTop) {
          lista.scrollTop = li.offsetTop - 6;
        } else if (li.offsetTop + li.offsetHeight > lista.scrollTop + lista.clientHeight) {
          lista.scrollTop = li.offsetTop + li.offsetHeight - lista.clientHeight + 6;
        }
      }
    }

    function abrir() {
      if (boton.disabled) return;
      if (cerrarAbierto) cerrarAbierto();
      activa = indice();
      pintarLista();
      // Se abre hacia arriba si no cabe debajo
      const hueco = boton.getBoundingClientRect();
      const abajo = window.innerHeight - hueco.bottom;
      caja.classList.toggle('hacia-arriba', abajo < 280 && hueco.top > abajo);
      lista.hidden = false;
      requestAnimationFrame(() => caja.classList.add('abierto'));
      boton.setAttribute('aria-expanded', 'true');
      cerrarAbierto = cerrar;
      resaltar();
    }

    function cerrar() {
      caja.classList.remove('abierto');
      boton.setAttribute('aria-expanded', 'false');
      boton.removeAttribute('aria-activedescendant');
      lista.hidden = true;
      if (cerrarAbierto === cerrar) cerrarAbierto = null;
    }

    function elegir(i) {
      const antes = indice();
      INDICE.set.call(select, i);
      refrescar();
      cerrar();
      boton.focus();
      if (antes !== i) {
        select.dispatchEvent(new Event('input', { bubbles: true }));
        select.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }

    boton.addEventListener('click', () => (lista.hidden ? abrir() : cerrar()));
    boton.addEventListener('keydown', (e) => {
      const total = select.options.length;
      if (lista.hidden) {
        if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(e.key)) {
          e.preventDefault();
          abrir();
        }
        return;
      }
      if (e.key === 'ArrowDown') { e.preventDefault(); activa = Math.min(total - 1, activa + 1); resaltar(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); activa = Math.max(0, activa - 1); resaltar(); }
      else if (e.key === 'Home') { e.preventDefault(); activa = 0; resaltar(); }
      else if (e.key === 'End') { e.preventDefault(); activa = total - 1; resaltar(); }
      else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); if (activa >= 0) elegir(activa); }
      else if (e.key === 'Escape') { e.preventDefault(); cerrar(); }
      else if (e.key === 'Tab') { cerrar(); }
      else if (e.key.length === 1) {
        // Saltar a la siguiente opción que empiece por esa letra
        const letra = e.key.toLowerCase();
        const textos = [...select.options].map(o => o.textContent.toLowerCase());
        let i = textos.findIndex((t, j) => j > activa && t.startsWith(letra));
        if (i < 0) i = textos.findIndex(t => t.startsWith(letra));
        if (i >= 0) { activa = i; resaltar(); }
      }
    });

    // Si otro código cambia el valor, las opciones o el estado del <select>, el botón se actualiza solo
    Object.defineProperty(select, 'value', {
      configurable: true,
      get() { return VALOR.get.call(select); },
      set(v) { VALOR.set.call(select, v); refrescar(); }
    });
    Object.defineProperty(select, 'selectedIndex', {
      configurable: true,
      get() { return INDICE.get.call(select); },
      set(v) { INDICE.set.call(select, v); refrescar(); }
    });
    new MutationObserver(refrescar).observe(select, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['disabled'] });
    select.addEventListener('change', refrescar);
    refrescar();
  }

  // Un clic fuera cierra el desplegable abierto
  document.addEventListener('mousedown', (e) => {
    if (cerrarAbierto && !e.target.closest('.desplegable.abierto')) cerrarAbierto();
  });

  // Confirmación en el sitio: el botón se sustituye por «pregunta [Sí] No». Devuelve true o false.
  function confirmar(boton, { pregunta, si = 'Sí', no = 'Cancelar' }) {
    return new Promise((resolver) => {
      const caja = document.createElement('span');
      caja.className = 'confirmacion-sitio';
      caja.setAttribute('role', 'group');
      caja.setAttribute('aria-label', pregunta);
      const texto = document.createElement('span');
      texto.textContent = pregunta;
      const botonSi = document.createElement('button');
      botonSi.type = 'button';
      botonSi.className = 'btn-confirmar';
      botonSi.textContent = si;
      const botonNo = document.createElement('button');
      botonNo.type = 'button';
      botonNo.className = 'boton-texto';
      botonNo.textContent = no;
      caja.append(texto, botonSi, botonNo);

      boton.hidden = true;
      boton.after(caja);
      botonSi.focus();

      const terminar = (respuesta) => {
        document.removeEventListener('keydown', alPulsarTecla);
        caja.remove();
        boton.hidden = false;
        if (!respuesta && document.contains(boton)) boton.focus();
        resolver(respuesta);
      };
      const alPulsarTecla = (e) => { if (e.key === 'Escape') terminar(false); };
      botonSi.addEventListener('click', () => terminar(true));
      botonNo.addEventListener('click', () => terminar(false));
      document.addEventListener('keydown', alPulsarTecla);
    });
  }

  // Confirmación en un bloque dentro de la página, antes del elemento indicado (para avisos largos)
  function confirmarBloque(antesDe, { titulo, detalle = [], si, no = 'Cancelar' }) {
    return new Promise((resolver) => {
      document.querySelectorAll('.confirmacion-bloque').forEach(b => b.remove());
      const bloque = document.createElement('div');
      bloque.className = 'confirmacion-bloque';
      bloque.setAttribute('role', 'alertdialog');
      const encabezado = document.createElement('strong');
      encabezado.textContent = titulo;
      bloque.appendChild(encabezado);
      if (detalle.length) {
        const lista = document.createElement('ul');
        lista.replaceChildren(...detalle.map(t => { const li = document.createElement('li'); li.textContent = t; return li; }));
        bloque.appendChild(lista);
      }
      const acciones = document.createElement('div');
      acciones.className = 'confirmacion-acciones';
      const botonNo = document.createElement('button');
      botonNo.type = 'button';
      botonNo.className = 'boton-texto';
      botonNo.textContent = no;
      const botonSi = document.createElement('button');
      botonSi.type = 'button';
      botonSi.className = 'btn btn-peligro';
      botonSi.textContent = si;
      acciones.append(botonNo, botonSi);
      bloque.appendChild(acciones);
      antesDe.before(bloque);
      bloque.scrollIntoView({ behavior: 'smooth', block: 'center' });
      botonSi.focus({ preventScroll: true });

      const terminar = (respuesta) => { bloque.remove(); resolver(respuesta); };
      botonSi.addEventListener('click', () => terminar(true));
      botonNo.addEventListener('click', () => terminar(false));
    });
  }

  document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('select').forEach(mejorarDesplegable);
  });

  return { mejorarDesplegable, confirmar, confirmarBloque };
})();
