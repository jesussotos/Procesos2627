const BREVO_URL = 'https://api.brevo.com/v3/smtp/email';

const crearServicioCorreoBrevo = ({
  apiKey = process.env.BREVO_API_KEY,
  remitente = process.env.BREVO_SENDER_EMAIL,
  nombreRemitente = process.env.BREVO_SENDER_NAME
} = {}) => ({
  enviarConfirmacion: async ({ destinatario, enlace }) => {
    if (!apiKey || !remitente || !nombreRemitente) {
      throw new Error('El servicio de correo no está configurado');
    }

    const respuesta = await fetch(BREVO_URL, {
      method: 'POST',
      headers: {
        'accept': 'application/json',
        'api-key': apiKey,
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        sender: { email: remitente, name: nombreRemitente },
        to: [{ email: destinatario }],
        subject: 'Confirma tu cuenta',
        htmlContent: `<p>Confirma tu cuenta desde <a href="${enlace}">este enlace</a>.</p>`
      })
    });

    if (!respuesta.ok) {
      throw new Error('El proveedor de correo rechazó el envío');
    }
  }
});

module.exports = { crearServicioCorreoBrevo };
