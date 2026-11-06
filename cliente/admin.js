// Panel de administración: usuarios (RF-07, RF-08, RF-09) y catálogo de sectores (RF-22)
document.addEventListener('DOMContentLoaded', async () => {
  const token = localStorage.getItem('jwt_token');
  const rol = localStorage.getItem('rol');
  const mensajeDiv = document.getElementById('mensaje');
  const contenedorUsuarios = document.getElementById('lista-usuarios');

  // Seguridad en el cliente: si no hay token o no es admin, fuera (el servidor también lo comprueba)
  if (!token || rol !== 'admin') {
    window.location.href = '/index.html';
    return;
  }

  function cerrarSesion() {
    localStorage.removeItem('jwt_token');
    localStorage.removeItem('rol');
    window.location.href = '/index.html';
  }
  document.getElementById('btn-logout').addEventListener('click', cerrarSesion);

  function mostrarMensaje(texto, esExito = false) {
    mensajeDiv.style.display = 'block';
    mensajeDiv.textContent = texto;
    mensajeDiv.classList.toggle('alert-exito', esExito);
  }

  async function peticion(metodo, ruta, cuerpo) {
    const opciones = { method: metodo, headers: { 'Authorization': `Bearer ${token}` } };
    if (cuerpo !== undefined) {
      opciones.headers['Content-Type'] = 'application/json';
      opciones.body = JSON.stringify(cuerpo);
    }
    const res = await fetch(ruta, opciones);
    const data = await res.json();
    if (res.status === 401) cerrarSesion(); // la sesión ha caducado o la cuenta ya no está activa
    if (!res.ok) throw new Error(data.error || 'Error en la petición');
    return data;
  }

  // Utilidades para pintar tablas sin interpretar nunca el texto como HTML
  function celda(texto, clase = '') {
    const td = document.createElement('td');
    if (clase) td.className = clase;
    td.textContent = texto;
    return td;
  }

  function celdaEstado(estado) {
    const td = document.createElement('td');
    const marca = document.createElement('span');
    marca.className = `estado estado-${estado}`;
    marca.textContent = estado;
    td.appendChild(marca);
    return td;
  }

  // Cifra del resumen de la banda, con la etiqueta en singular o plural
  function cifra(clave, numero, singular, plural) {
    document.getElementById(`n-${clave}`).textContent = numero;
    document.getElementById(`t-${clave}`).textContent = numero === 1 ? singular : plural;
  }

  function boton(texto, alPulsar, peligro = false) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = peligro ? 'boton-texto peligro' : 'boton-texto';
    b.textContent = texto;
    b.addEventListener('click', alPulsar);
    return b;
  }

  function tabla(columnas) {
    const t = document.createElement('table');
    t.className = 'tabla';
    const filaCabecera = document.createElement('tr');
    columnas.forEach(nombre => {
      const th = document.createElement('th');
      th.textContent = nombre;
      filaCabecera.appendChild(th);
    });
    const thead = document.createElement('thead');
    thead.appendChild(filaCabecera);
    const tbody = document.createElement('tbody');
    t.append(thead, tbody);
    return { t, tbody };
  }

  // --- Usuarios (RF-07, RF-08, RF-09) ---

  async function comprobarActivo(u) {
    try {
      const r = await peticion('GET', `/api/usuarios/${u.id}/activo`);
      mostrarMensaje(r.activo ? `${r.email} está activo.` : `${r.email} no está activo (estado: ${r.estado}).`, r.activo);
    } catch (error) {
      mostrarMensaje(error.message);
    }
  }

  async function eliminar(u) {
    if (!confirm(`¿Eliminar la cuenta ${u.email}? No podrá iniciar sesión hasta que vuelva a registrarse.`)) return;
    try {
      await peticion('DELETE', `/api/usuarios/${u.id}`);
      mostrarMensaje(`Cuenta ${u.email} eliminada.`, true);
      await cargarUsuarios();
    } catch (error) {
      mostrarMensaje(error.message);
    }
  }

  async function cargarUsuarios() {
    try {
      const [yo, usuarios] = await Promise.all([
        peticion('GET', '/api/usuarios/me'),
        peticion('GET', '/api/usuarios')
      ]);
      document.getElementById('user-info').textContent = yo.usuario.email;
      const contar = estado => usuarios.filter(u => u.estado === estado).length;
      cifra('cuentas', usuarios.length, 'cuenta', 'cuentas');
      cifra('activas', contar('activo'), 'activa', 'activas');
      cifra('pendientes', contar('pendiente'), 'pendiente', 'pendientes');

      if (usuarios.length === 0) {
        contenedorUsuarios.innerHTML = '<p class="ayuda">Todavía no hay cuentas registradas.</p>';
        return;
      }
      const { t, tbody } = tabla(['Correo', 'Rol', 'Estado', '']);
      t.querySelectorAll('th')[1].className = 'col-secundaria';
      usuarios.forEach(u => {
        const fila = document.createElement('tr');
        fila.append(celda(u.email, u.estado === 'eliminado' ? 'apagado' : ''), celda(u.rol, 'rol col-secundaria'), celdaEstado(u.estado));
        const acciones = document.createElement('td');
        acciones.appendChild(boton('Comprobar', () => comprobarActivo(u)));
        // El admin no puede eliminarse a sí mismo (RN-09) ni eliminar dos veces la misma cuenta
        if (u.id !== yo.usuario.id && u.estado !== 'eliminado') {
          acciones.appendChild(boton('Eliminar', () => eliminar(u), true));
        }
        fila.appendChild(acciones);
        tbody.appendChild(fila);
      });
      contenedorUsuarios.replaceChildren(t);
    } catch (error) {
      mostrarMensaje(error.message || 'Error al conectar con el servidor.');
      contenedorUsuarios.innerHTML = '';
    }
  }

  // --- Sectores (RF-22) ---
  const contenedorSectores = document.getElementById('lista-sectores');
  const formSector = document.getElementById('form-sector');
  const inputSector = document.getElementById('nuevo-sector');

  formSector.addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      const sector = await peticion('POST', '/api/sectores', { nombre: inputSector.value });
      mostrarMensaje(`Sector «${sector.nombre}» añadido.`, true);
      formSector.reset();
      await cargarSectores();
    } catch (error) {
      mostrarMensaje(error.message);
    }
  });

  async function renombrarSector(s) {
    const nombre = prompt(`Nuevo nombre para «${s.nombre}»:`, s.nombre);
    if (nombre === null || nombre.trim() === s.nombre) return;
    try {
      const actualizado = await peticion('PATCH', `/api/sectores/${s.id}`, { nombre });
      mostrarMensaje(`Sector renombrado a «${actualizado.nombre}».`, true);
      await cargarSectores();
    } catch (error) {
      mostrarMensaje(error.message);
    }
  }

  async function cambiarEstadoSector(s) {
    try {
      await peticion('PATCH', `/api/sectores/${s.id}`, { activo: !s.activo });
      mostrarMensaje(`Sector «${s.nombre}» ${s.activo ? 'desactivado' : 'activado'}.`, true);
      await cargarSectores();
    } catch (error) {
      mostrarMensaje(error.message);
    }
  }

  async function cargarSectores() {
    try {
      const sectores = await peticion('GET', '/api/sectores/todos');
      cifra('sectores', sectores.filter(s => s.activo).length, 'sector activo', 'sectores activos');
      if (sectores.length === 0) {
        contenedorSectores.innerHTML = '<p class="ayuda">Todavía no hay sectores. Añade el primero con el formulario.</p>';
        return;
      }
      const { t, tbody } = tabla(['Sector', 'Estado', '']);
      sectores.forEach(s => {
        const fila = document.createElement('tr');
        fila.append(celda(s.nombre, s.activo ? '' : 'apagado'), celdaEstado(s.activo ? 'activo' : 'desactivado'));
        const acciones = document.createElement('td');
        acciones.append(
          boton('Renombrar', () => renombrarSector(s)),
          s.activo ? boton('Desactivar', () => cambiarEstadoSector(s), true) : boton('Activar', () => cambiarEstadoSector(s))
        );
        fila.appendChild(acciones);
        tbody.appendChild(fila);
      });
      contenedorSectores.replaceChildren(t);
    } catch (error) {
      mostrarMensaje(error.message);
      contenedorSectores.innerHTML = '';
    }
  }

  cargarUsuarios();
  cargarSectores();
});
