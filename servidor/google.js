// Adaptador de Google (RF-04): inicio de sesión con OAuth 2.0, flujo de código de autorización.
// La lógica de negocio no conoce Google: solo pide la URL a la que mandar al usuario y, con el código
// que Google devuelve, recibe la identidad { googleId, email, emailVerificado }.
// El secreto de cliente solo se usa aquí, en el servidor; nunca llega al navegador.

const URL_AUTORIZACION = 'https://accounts.google.com/o/oauth2/v2/auth';
const URL_TOKEN = 'https://oauth2.googleapis.com/token';
const EMISORES = ['accounts.google.com', 'https://accounts.google.com'];

// Devuelve null si faltan las credenciales: el resto de la aplicación funciona igual sin Google
function crearAccesoGoogle({ clientId, clientSecret, urlRetorno }) {
  if (!clientId || !clientSecret) {
    return null;
  }

  return {
    // Página de Google donde el usuario elige su cuenta. `estado` protege contra CSRF (se comprueba al volver)
    urlAutorizacion: (estado) => {
      const parametros = new URLSearchParams({
        client_id: clientId,
        redirect_uri: urlRetorno,
        response_type: 'code',
        scope: 'openid email',
        state: estado,
        prompt: 'select_account'
      });
      return `${URL_AUTORIZACION}?${parametros}`;
    },

    // Cambia el código por los tokens de Google y extrae la identidad del id_token
    obtenerIdentidad: async (codigo) => {
      const respuesta = await fetch(URL_TOKEN, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          code: codigo,
          client_id: clientId,
          client_secret: clientSecret,
          redirect_uri: urlRetorno,
          grant_type: 'authorization_code'
        })
      });
      if (!respuesta.ok) {
        const detalle = await respuesta.text();
        throw new Error(`Google respondió ${respuesta.status}: ${detalle}`);
      }
      const { id_token: idToken } = await respuesta.json();

      // El id_token llega directamente de Google por HTTPS a cambio de nuestro secreto, así que no hace
      // falta verificar su firma; sí se comprueba que es para esta aplicación y que no ha caducado
      const datos = JSON.parse(Buffer.from(idToken.split('.')[1], 'base64url').toString('utf8'));
      if (datos.aud !== clientId || !EMISORES.includes(datos.iss) || datos.exp * 1000 < Date.now()) {
        throw new Error('El token de Google no es válido para esta aplicación');
      }
      return {
        googleId: datos.sub,
        email: datos.email,
        emailVerificado: datos.email_verified === true || datos.email_verified === 'true'
      };
    }
  };
}

module.exports = { crearAccesoGoogle };
