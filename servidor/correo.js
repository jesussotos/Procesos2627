// Adaptador de correo: envía los emails de confirmación mediante la API HTTP de Brevo.
// La lógica de negocio no conoce Brevo: solo llama a enviarConfirmacion(email, token).

const BREVO_URL = 'https://api.brevo.com/v3/smtp/email';

function crearCorreoBrevo({ apiKey, remitente, nombreRemitente, urlBase }) {
  if (!apiKey || !remitente) {
    throw new Error('Faltan BREVO_API_KEY o MAIL_FROM en las variables de entorno');
  }

  return {
    enviarConfirmacion: async (email, token) => {
      const enlace = `${urlBase}/api/usuarios/confirmar?token=${encodeURIComponent(token)}`;

      const respuesta = await fetch(BREVO_URL, {
        method: 'POST',
        headers: {
          'api-key': apiKey,
          'content-type': 'application/json',
          accept: 'application/json'
        },
        body: JSON.stringify({
          sender: { email: remitente, name: nombreRemitente || 'Procesos2627' },
          to: [{ email }],
          subject: 'Confirma tu cuenta',
          htmlContent: `
            <p>Hola,</p>
            <p>Gracias por registrarte. Para activar tu cuenta pulsa en el siguiente enlace:</p>
            <p><a href="${enlace}">Confirmar mi cuenta</a></p>
            <p>El enlace caduca en 24 horas. Si no te has registrado, ignora este correo.</p>`,
          textContent: `Confirma tu cuenta abriendo este enlace (caduca en 24 horas): ${enlace}`
        })
      });

      if (!respuesta.ok) {
        const detalle = await respuesta.text();
        throw new Error(`Brevo respondió ${respuesta.status}: ${detalle}`);
      }

      console.log(`[correo] Confirmación enviada a ${email}`);
    }
  };
}

module.exports = { crearCorreoBrevo };
