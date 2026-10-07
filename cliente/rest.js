const REST = {
  // Guardar token y sesión
  guardarSesion: (token, usuario) => {
    localStorage.setItem('jwt_token', token);
    localStorage.setItem('usuario', JSON.stringify(usuario));
  },

  obtenerToken: () => localStorage.getItem('jwt_token'),

  cerrarSesion: () => {
    localStorage.removeItem('jwt_token');
    localStorage.removeItem('usuario');
  },

  // Registro de usuario
  registrar: async (email, password) => {
    const res = await fetch('/api/usuarios/registro', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    
    const contentType = res.headers.get('content-type');
    if (!contentType || !contentType.includes('application/json')) {
      const text = await res.text();
      console.error('Respuesta no JSON del servidor:', text);
      throw new Error(`El servidor devolvió un error HTTP ${res.status}`);
    }

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Error al registrar');
    return data;
  },

  // Inicio de sesión
  login: async (email, password) => {
    const res = await fetch('/api/usuarios/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });

    const contentType = res.headers.get('content-type');
    if (!contentType || !contentType.includes('application/json')) {
      const text = await res.text();
      console.error('Respuesta no JSON del servidor:', text);
      throw new Error(`Ruta no encontrada o error del servidor (HTTP ${res.status})`);
    }

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Error al iniciar sesión');
    REST.guardarSesion(data.token, data.usuario);
    return data;
  },

  // Obtener perfil actual
  obtenerPerfil: async () => {
    const token = REST.obtenerToken();
    if (!token) return null;

    try {
      const res = await fetch('/api/usuarios/me', {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      const contentType = res.headers.get('content-type');
      if (!res.ok || !contentType || !contentType.includes('application/json')) {
        REST.cerrarSesion();
        return null;
      }

      const data = await res.json();
      return data.usuario;
    } catch (error) {
      REST.cerrarSesion();
      return null;
    }
  }
};