const nodemailer = require('nodemailer');

async function sendInvoiceEmail({ to, cc, subject, text, attachments }) {
  const transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 465,
    secure: true,
    auth: {
      user: process.env.OUTLOOK_USER,
      pass: process.env.OUTLOOK_PASS
    },
    connectionTimeout: 30000,
    greetingTimeout: 20000,
    socketTimeout: 30000,
  });

  const mailOptions = {
    from: process.env.OUTLOOK_USER,
    to,
    cc,
    subject,
    text,
    attachments, // [{ filename, path }]
  };

  await transporter.sendMail(mailOptions);
}

module.exports = sendInvoiceEmail;