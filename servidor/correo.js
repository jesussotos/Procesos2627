const nodemailer = require('nodemailer');

const crearServicioCorreoGmail = ({
  host = process.env.SMTP_HOST || 'smtp.gmail.com',
  port = Number(process.env.SMTP_PORT || 465),
  secure = process.env.SMTP_SECURE !== 'false',
  usuario = process.env.SMTP_USER,
  password = process.env.SMTP_PASSWORD,
  nombreRemitente = process.env.SMTP_FROM_NAME || 'Procesos2627'
} = {}) => {
  const transporter = nodemailer.createTransport({
    host,
    port,
    secure,
    auth: usuario && password
      ? { user: usuario, pass: password.replace(/\s/g, '') }
      : undefined
  });

  return {
    enviarConfirmacion: async ({ destinatario, enlace }) => {
      if (!usuario || !password) {
        throw new Error('El servicio de correo Gmail no está configurado');
      }

      await transporter.sendMail({
        from: { name: nombreRemitente, address: usuario },
        to: destinatario,
        subject: 'Confirma tu cuenta',
        html: `<p>Confirma tu cuenta desde <a href="${enlace}">este enlace</a>.</p>`
      });
    }
  };
};

module.exports = { crearServicioCorreoGmail };
