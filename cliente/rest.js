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
    if (esExito) {
      mensajeDiv.style.backgroundColor = '#f0fdf4';
      mensajeDiv.style.color = '#166534';
      mensajeDiv.style.borderColor = '#bbf7d0';
    } else {
      mensajeDiv.style.backgroundColor = '#fef2f2';
      mensajeDiv.style.color = '#dc2626';
      mensajeDiv.style.borderColor = '#fecaca';
    }
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
        userInfo.textContent = `Sesión iniciada como: ${data.usuario.email} (${data.usuario.rol})`;
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
          localStorage.setItem('jwt_token', data.token);
          mostrarMensaje('¡Inicio de sesión exitoso!', true);
          setTimeout(() => {
            verificarSesion();
          }, 500);
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

          mostrarMensaje('¡Cuenta creada correctamente! Ya puedes iniciar sesión.', true);
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
      verificarSesion();
      mostrarMensaje('Has cerrado sesión correctamente', true);
    });
  }

  verificarSesion();
});