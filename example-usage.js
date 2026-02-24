// Replace your old Supabase function call with this:

// Example usage in your frontend/backend code:
async function sendInvoice(invoiceData) {
  try {
    const response = await fetch('http://localhost:3001/api/send-invoice-email', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        to: 'esubmit@afs.net',
        cc: ['kevin@go4fc.com', 'gofarmsbills@gmail.com'],
        subject: `Invoice ${invoiceData.invoiceNumber} — GO 4 Farms & Cattle ($${invoiceData.amount})`,
        text: 'Please see attached invoice.\nThank you,\nGO 4 Farms & Cattle',
        attachments: [
          { 
            filename: `${invoiceData.invoiceNumber}.pdf`, 
            path: invoiceData.pdfPath // or use 'content' with base64
          }
        ],
        invoiceNumber: invoiceData.invoiceNumber,
        amount: invoiceData.amount
      })
    });

    const result = await response.json();
    
    if (result.success) {
      console.log('✅ Invoice sent successfully');
      return result;
    } else {
      console.error('❌ Failed to send invoice:', result.error);
      throw new Error(result.error);
    }
  } catch (error) {
    console.error('❌ Email error:', error);
    throw error;
  }
}

// For production, replace localhost with your Railway URL:
// https://your-app.railway.app/api/send-invoice-email
