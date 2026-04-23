const nodemailer = require('nodemailer');

async function sendInvoiceEmail({ to, cc, subject, text, attachments }) {
  const transporter = nodemailer.createTransport({
    host: 'smtp.office365.com',
    port: 587,
    secure: false,
    family: 4,
    auth: {
      user: process.env.OUTLOOK_USER,
      pass: process.env.OUTLOOK_PASS
    },
    connectionTimeout: 15000,
    greetingTimeout: 10000,
    socketTimeout: 15000,
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