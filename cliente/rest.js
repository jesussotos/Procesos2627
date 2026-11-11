document.addEventListener('DOMContentLoaded', () => {
  const formLogin = document.getElementById('form-login');
  const formRegistro = document.getElementById('form-registro');
  const btnLogout = document.getElementById('btn-logout');
  const mensajeDiv = document.getElementById('mensaje');
  const authContainer = document.getElementById('auth-container');
  const sessionContainer = document.getElementById('session-container');
  const userInfo = document.getElementById('user-info');

  function mostrarMensaje(texto, esExito = false) {
    mensajeDiv.style.display = 'block';
    mensajeDiv.textContent = texto;
    mensajeDiv.classList.toggle('alert-exito', esExito);
  }

  async function verificarSesion() {
    const token = localStorage.getItem('jwt_token');
    if (!token) {
      authContainer.style.display = 'block';
      sessionContainer.style.display = 'none';
      return;
    }

    try {
      const res = await fetch('/api/usuarios/me', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (res.ok) {
        const data = await res.json();
        authContainer.style.display = 'none';
        sessionContainer.style.display = 'flex';
        userInfo.textContent = `Has entrado como ${data.usuario.email}.`;
        document.getElementById('ir-panel').href = data.usuario.rol === 'admin' ? '/admin.html' : '/dashboard.html';
      } else {
        localStorage.removeItem('jwt_token');
        authContainer.style.display = 'block';
        sessionContainer.style.display = 'none';
      }
    } catch (error) {
      mostrarMensaje('Error de conexión con el servidor');
    }
  }

  // Evento Iniciar Sesión
  // Evento Iniciar Sesión
  if (formLogin) {
    formLogin.addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = document.getElementById('login-email').value;
      const password = document.getElementById('login-password').value;

      try {
        const res = await fetch('/api/usuarios/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password })
        });

        const data = await res.json();

        if (res.ok) {
          // --- AQUÍ ESTÁ EL CAMBIO ---
          localStorage.setItem('jwt_token', data.token);
          localStorage.setItem('rol', data.usuario.rol); // Guardamos el rol que viene del servidor

          mostrarMensaje('Sesión iniciada', true);
          
          // Redirección automática según el rol
          setTimeout(() => {
            if (data.usuario.rol === 'admin') {
              window.location.href = '/admin.html'; // Te manda al panel de administrador
            } else {
              window.location.href = '/dashboard.html'; // Te manda a la vista normal
            }
          }, 500);
          // ---------------------------

        } else {
          mostrarMensaje(data.error || 'Credenciales incorrectas');
        }
      } catch (error) {
        mostrarMensaje('Error al conectar con el servidor');
      }
    });
  }

  // Evento Registro
  if (formRegistro) {
    formRegistro.addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = document.getElementById('reg-email').value;
      const password = document.getElementById('reg-password').value;

      try {
        const res = await fetch('/api/usuarios/registro', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password })
        });

        const data = await res.json();

        if (res.ok) {
          formRegistro.reset();
          
          // Cambiar a la pestaña de login
          const formLogin = document.getElementById('form-login');
          const tabLogin = document.getElementById('tab-login');
          const tabRegistro = document.getElementById('tab-registro');

          formRegistro.classList.remove('active');
          formLogin.classList.add('active');
          tabRegistro.classList.remove('active');
          tabLogin.classList.add('active');

          mostrarMensaje(`Cuenta creada. Te hemos enviado un correo a ${email} para confirmarla antes de iniciar sesión.`, true);
        } else {
          mostrarMensaje(data.error || 'Error al registrar el usuario');
        }
      } catch (error) {
        mostrarMensaje('Error al conectar con el servidor');
      }
    });
  }

  // Evento Cerrar Sesión
  if (btnLogout) {
    btnLogout.addEventListener('click', () => {
      localStorage.removeItem('jwt_token');
      localStorage.removeItem('rol');
      verificarSesion();
      mostrarMensaje('Sesión cerrada', true);
    });
  }

  // Vuelta del acceso con Google (RF-04): el servidor deja el token en el fragmento #google=...
  // Se guarda como en un inicio de sesión normal y se quita de la barra de direcciones
  if (window.location.hash.startsWith('#google=')) {
    const token = decodeURIComponent(window.location.hash.slice('#google='.length));
    window.history.replaceState({}, '', window.location.pathname);
    localStorage.setItem('jwt_token', token);
    entrarConToken(token);
    return;
  }

  // Con el token ya guardado, pide los datos de la sesión y lleva a cada uno a su panel
  async function entrarConToken(token) {
    try {
      const res = await fetch('/api/usuarios/me', { headers: { 'Authorization': `Bearer ${token}` } });
      if (!res.ok) throw new Error();
      const { usuario } = await res.json();
      localStorage.setItem('rol', usuario.rol);
      window.location.href = usuario.rol === 'admin' ? '/admin.html' : '/dashboard.html';
    } catch (error) {
      localStorage.removeItem('jwt_token');
      mostrarMensaje('No se pudo completar el acceso con Google. Inténtalo de nuevo');
      verificarSesion();
    }
  }

  // Resultado de la confirmación por correo (el servidor redirige aquí con ?confirmacion=...)
  const params = new URLSearchParams(window.location.search);
  if (params.get('confirmacion') === 'ok') {
    mostrarMensaje('Cuenta confirmada. Ya puedes iniciar sesión.', true);
  } else if (params.get('confirmacion') === 'error') {
    mostrarMensaje(params.get('motivo') || 'No se pudo confirmar la cuenta');
  }
  if (params.get('cuenta') === 'eliminada') {
    mostrarMensaje('Tu cuenta se ha eliminado. Puedes volver a registrarte con el mismo correo cuando quieras.', true);
  }
  if (params.get('google') === 'error') {
    mostrarMensaje(params.get('motivo') || 'No se pudo completar el acceso con Google');
  }
  if (params.has('confirmacion') || params.has('cuenta') || params.has('google')) {
    window.history.replaceState({}, '', window.location.pathname);
  }

  // Ficha de ejemplo para el profesional: la misma tarjeta que verán los clientes (D-32)
  const ejemplo = document.getElementById('ficha-ejemplo');
  if (ejemplo) {
    ejemplo.replaceChildren(crearTarjeta({
      nombreComercial: 'Fontanería Pérez',
      logo: null,
      zona: 'Madrid, Majadahonda y Pozuelo de Alarcón',
      fotos: [],
      totalFotos: 0,
      descripcion: 'Más de 15 años reparando instalaciones de agua y gas. Urgencias en el día.',
      sectores: [
        { nombre: 'Fontanería', especialidad: 'Calderas, calentadores y fugas' },
        { nombre: 'Climatización', especialidad: 'Instalación de aire acondicionado' }
      ],
      contacto: ['telefono', 'whatsapp', 'web'],
      servicios: [
        { titulo: 'Reparación de fugas', tipoPrecio: 'fijo', importe: 45, ivaIncluido: true },
        { titulo: 'Revisión de caldera', tipoPrecio: 'presupuesto', presupuestoGratis: true }
      ],
      totalServicios: 2,
      precioReferencia: 45
    }));
  }

  verificarSesion();
});
