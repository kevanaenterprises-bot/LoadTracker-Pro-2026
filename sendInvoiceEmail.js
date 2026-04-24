async function sendInvoiceEmail({ to, cc, subject, text, attachments }) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error('RESEND_API_KEY environment variable is not set');

  const fromName = process.env.FROM_NAME || 'GO 4 Farms & Cattle';
  const fromEmail = process.env.FROM_EMAIL || 'kevin@go4fc.com';

  const body = {
    from: `${fromName} <${fromEmail}>`,
    to: Array.isArray(to) ? to : [to],
    cc: cc ? (Array.isArray(cc) ? cc : [cc]) : undefined,
    subject,
    text,
    attachments: attachments && attachments.length > 0
      ? attachments.map(a => ({
          filename: a.filename,
          // Resend requires base64 string — convert Buffer if needed
          content: Buffer.isBuffer(a.content)
            ? a.content.toString('base64')
            : (typeof a.content === 'string' ? a.content : ''),
        }))
      : undefined,
  };

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data?.message || data?.name || 'Resend API error');
  }
  return data;
}

module.exports = sendInvoiceEmail;
