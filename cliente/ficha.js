// Ficha pública de un profesional (RF-21). Todo el texto del profesional se pinta con textContent
// (RNF-10) y solo se muestran los contactos que él ha publicado (RNF-11).
document.addEventListener('DOMContentLoaded', async () => {
  const mensajeDiv = document.getElementById('mensaje');
  const id = Number(new URLSearchParams(location.search).get('id'));

  pintarAccesoBarra();

  // «Volver a la búsqueda» lleva a la búsqueda de la que se vino, si la hay
  if (document.referrer) {
    const origen = new URL(document.referrer);
    if (origen.origin === location.origin && origen.pathname === '/') {
      document.getElementById('volver').href = origen.pathname + origen.search;
    }
  }

  function crear(etiqueta, clase, texto) {
    const elemento = document.createElement(etiqueta);
    if (clase) elemento.className = clase;
    if (texto !== undefined) elemento.textContent = texto;
    return elemento;
  }

  try {
    const res = await fetch(`/api/profesionales/${id}`);
    const ficha = await res.json();
    if (!res.ok) throw new Error(ficha.error || 'No se pudo cargar la ficha');
    pintar(ficha);
  } catch (error) {
    document.getElementById('ficha-nombre').textContent = 'Profesional no disponible';
    mensajeDiv.style.display = 'block';
    mensajeDiv.textContent = `${error.message}. Puede que haya dejado de publicar su ficha.`;
  }

  function pintar(ficha) {
    document.title = `${ficha.nombreComercial} · Oficios`;
    document.getElementById('ficha-nombre').textContent = ficha.nombreComercial;
    document.getElementById('ficha-sectores').textContent = ficha.sectores.map(s => s.nombre).join(', ');
    pintarLogo(document.getElementById('ficha-logo'), ficha.logo, ficha.nombreComercial);

    // Descripción y fotos (opcionales)
    document.getElementById('bloque-descripcion').hidden = !ficha.descripcion;
    document.getElementById('ficha-descripcion').textContent = ficha.descripcion;
    document.getElementById('bloque-fotos').hidden = ficha.fotos.length === 0;
    document.getElementById('ficha-fotos').replaceChildren(...ficha.fotos.map((foto, i) => {
      const enlace = crear('a');
      enlace.href = foto.url;
      enlace.target = '_blank';
      enlace.rel = 'noopener';
      const img = crear('img');
      img.src = foto.url;
      img.alt = `Trabajo ${i + 1} de ${ficha.nombreComercial}`;
      img.loading = 'lazy';
      enlace.appendChild(img);
      return enlace;
    }));

    // Servicios agrupados por sector, con la especialidad del profesional en cada uno
    const contenedor = document.getElementById('ficha-servicios');
    contenedor.replaceChildren(...ficha.sectores.map(sector => {
      const grupo = crear('div', 'grupo-sector');
      grupo.append(crear('h3', '', sector.nombre), crear('p', '', sector.especialidad));
      ficha.servicios.filter(sv => sv.sectorId === sector.id).forEach(servicio => {
        const fila = crear('div', 'servicio-publico');
        const info = crear('div');
        info.appendChild(crear('strong', '', servicio.titulo));
        if (servicio.descripcion) info.appendChild(crear('p', 'descripcion', servicio.descripcion));
        const precio = crear('div', 'precio');
        const importe = crear('strong', '', Precio.texto(servicio));
        precio.appendChild(importe);
        const nota = Precio.iva(servicio) || (servicio.tipoPrecio === 'presupuesto' ? 'Precio cerrado tras ver el trabajo' : '');
        if (nota) precio.appendChild(crear('small', '', nota));
        fila.append(info, precio);
        grupo.appendChild(fila);
      });
      return grupo;
    }).filter(grupo => grupo.querySelector('.servicio-publico')));

    // Contacto: solo los medios publicados por el profesional
    const contacto = ficha.contacto;
    const botones = [];
    const boton = (texto, detalle, href, principal, externo) => {
      const a = crear('a', `btn ${principal ? 'btn-primary' : 'btn-secondary'}`);
      a.href = href;
      if (externo) {
        a.target = '_blank';
        a.rel = 'noopener nofollow';
      }
      a.append(texto, crear('span', '', detalle));
      botones.push(a);
    };
    if (contacto.telefono) boton('Llamar', contacto.telefono, Contacto.telefono(contacto.telefono), true);
    if (contacto.whatsapp) boton('WhatsApp', contacto.whatsapp, Contacto.whatsapp(contacto.whatsapp), !contacto.telefono, true);
    if (contacto.email) boton('Escribir', contacto.email, Contacto.email(contacto.email), false);
    if (contacto.web) boton('Web', new URL(contacto.web).hostname.replace(/^www\./, ''), contacto.web, false, true);
    document.getElementById('ficha-contacto').replaceChildren(...botones);

    document.getElementById('ficha-ciudades').replaceChildren(...ficha.ciudades.map(c => {
      const li = crear('li', '', c.nombre);
      li.title = c.provincia;
      return li;
    }));

    document.getElementById('ficha-contenido').hidden = false;
  }
});
