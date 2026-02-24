const nodemailer = require('nodemailer');

async function sendInvoiceEmail({ to, cc, subject, text, attachments }) {
  const transporter = nodemailer.createTransport({
    host: 'smtp.office365.com',
    port: 587,
    secure: false,
    auth: {
      user: process.env.OUTLOOK_USER,
      pass: process.env.OUTLOOK_PASS 
    }
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