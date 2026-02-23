// Supabase Edge Function: send-invoice-email
//
// Sends an invoice email to the customer with exactly ONE PDF attachment.
// The caller always merges the invoice page and all POD pages into a single PDF
// on the client (pods_combined === true) and passes it as invoice_pdf_base64.
// The edge function simply looks up the recipient address and sends that file.
//
// Legacy path (pods_combined omitted / false): falls back to fetching POD files
// from Supabase storage and attaching them individually.  Kept for backward
// compatibility only — new code should always pass pods_combined: true.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const {
      load_id,
      invoice_pdf_base64,
      invoice_pdf_filename,
      pods_combined,
      additional_emails,
    } = await req.json();

    if (!load_id || !invoice_pdf_base64 || !invoice_pdf_filename) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: load_id, invoice_pdf_base64, invoice_pdf_filename' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const resendApiKey = Deno.env.get('RESEND_API_KEY')!;

    if (!resendApiKey) {
      return new Response(
        JSON.stringify({ error: 'RESEND_API_KEY environment variable is not set' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // ── Look up load + customer for email address and metadata ──
    const { data: load, error: loadErr } = await supabase
      .from('loads')
      .select('*, customer:customers(*)')
      .eq('id', load_id)
      .single();

    if (loadErr || !load) {
      return new Response(
        JSON.stringify({ error: `Load not found: ${loadErr?.message || load_id}` }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const customer = load.customer as Record<string, string> | null;
    const primaryEmail = (customer?.pod_email || customer?.email || '').trim();

    if (!primaryEmail) {
      return new Response(
        JSON.stringify({ error: 'No email address found for this customer. Please add a POD email or general email to the customer record.' }),
        { status: 422, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // Build recipient list
    const toAddresses: string[] = [primaryEmail];
    if (Array.isArray(additional_emails)) {
      for (const e of additional_emails) {
        if (typeof e === 'string' && e.trim() && !toAddresses.includes(e.trim())) {
          toAddresses.push(e.trim());
        }
      }
    }

    // Fetch company settings for the email "from" address and name
    const { data: settingsRows } = await supabase.from('company_settings').select('key, value');
    const settings: Record<string, string> = {};
    if (settingsRows) {
      for (const row of settingsRows as Array<{ key: string; value: string }>) {
        settings[row.key] = row.value;
      }
    }
    const companyName = settings.company_name || 'GO 4 Farms & Cattle';
    const companyEmail = settings.company_email || 'accounting@go4fc.com';

    // Retrieve the invoice record for the load (used in email subject / body)
    const { data: invoice } = await supabase
      .from('invoices')
      .select('invoice_number, amount')
      .eq('load_id', load_id)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    const invoiceNumber = invoice?.invoice_number || 'N/A';
    const invoiceAmount = invoice?.amount
      ? Number(invoice.amount).toLocaleString('en-US', { style: 'currency', currency: 'USD' })
      : '';

    // ── Build attachments ──
    // When pods_combined === true the caller has embedded all POD pages inside
    // invoice_pdf_base64 already — send it as the ONE and only attachment.
    const attachments: Array<{ filename: string; content: string }> = [
      { filename: invoice_pdf_filename, content: invoice_pdf_base64 },
    ];

    // Legacy path: fetch PODs separately and attach them individually.
    // Kept for backward compatibility; not triggered when pods_combined === true.
    let attachmentFailures = 0;
    if (!pods_combined) {
      const { data: podDocs } = await supabase
        .from('pod_documents')
        .select('*')
        .eq('load_id', load_id);

      if (podDocs && podDocs.length > 0) {
        for (const doc of podDocs as Array<{ file_url: string; file_name: string; file_type: string }>) {
          try {
            const res = await fetch(doc.file_url);
            if (!res.ok) {
              attachmentFailures++;
              continue;
            }
            const buffer = await res.arrayBuffer();
            const b64 = btoa(String.fromCharCode(...new Uint8Array(buffer)));
            attachments.push({ filename: doc.file_name, content: b64 });
          } catch {
            attachmentFailures++;
          }
        }
      }
    }

    // ── Send via Resend ──
    const emailBody = {
      from: `${companyName} <${companyEmail}>`,
      to: toAddresses,
      subject: `Invoice ${invoiceNumber} — ${companyName}${invoiceAmount ? ` (${invoiceAmount})` : ''}`,
      html: buildEmailHtml({ companyName, invoiceNumber, invoiceAmount, loadNumber: load.load_number }),
      attachments,
    };

    const resendRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(emailBody),
    });

    const resendData = await resendRes.json();

    if (!resendRes.ok) {
      console.error('[send-invoice-email] Resend error:', resendData);
      return new Response(
        JSON.stringify({ error: resendData?.message || 'Failed to send email via Resend' }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: `Invoice emailed to ${toAddresses.join(', ')}`,
        emailed_to: primaryEmail,
        resend_id: resendData.id,
        attachment_count: attachments.length,
        attachment_failures: attachmentFailures,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[send-invoice-email] Unhandled error:', message);
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});

function buildEmailHtml(opts: {
  companyName: string;
  invoiceNumber: string;
  invoiceAmount: string;
  loadNumber: string;
}): string {
  const { companyName, invoiceNumber, invoiceAmount, loadNumber } = opts;
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Invoice ${invoiceNumber}</title>
</head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:32px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
          <!-- Header -->
          <tr>
            <td style="background:linear-gradient(135deg,#1e40af,#3b82f6);padding:28px 32px;text-align:center;">
              <p style="margin:0;font-size:22px;font-weight:800;color:#ffffff;letter-spacing:1px;">${companyName}</p>
              <p style="margin:6px 0 0;font-size:13px;color:rgba(255,255,255,0.85);">Invoice &amp; Proof of Delivery</p>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding:32px;">
              <p style="margin:0 0 16px;font-size:16px;color:#1e293b;">Please find attached the invoice and proof of delivery (1 combined PDF: invoice first, POD follows).</p>
              <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;margin-bottom:24px;">
                <tr>
                  <td style="padding:16px 20px;border-bottom:1px solid #e2e8f0;">
                    <span style="font-size:12px;font-weight:600;color:#64748b;text-transform:uppercase;letter-spacing:0.5px;">Invoice Number</span><br/>
                    <span style="font-size:18px;font-weight:700;color:#1e40af;">${invoiceNumber}</span>
                  </td>
                </tr>
                ${loadNumber ? `<tr>
                  <td style="padding:16px 20px;border-bottom:1px solid #e2e8f0;">
                    <span style="font-size:12px;font-weight:600;color:#64748b;text-transform:uppercase;letter-spacing:0.5px;">Load Number</span><br/>
                    <span style="font-size:16px;font-weight:600;color:#334155;">${loadNumber}</span>
                  </td>
                </tr>` : ''}
                ${invoiceAmount ? `<tr>
                  <td style="padding:16px 20px;">
                    <span style="font-size:12px;font-weight:600;color:#64748b;text-transform:uppercase;letter-spacing:0.5px;">Amount Due</span><br/>
                    <span style="font-size:20px;font-weight:800;color:#16a34a;">${invoiceAmount}</span>
                  </td>
                </tr>` : ''}
              </table>
              <p style="margin:0 0 8px;font-size:14px;color:#475569;">The attached PDF contains both the invoice and proof of delivery in a single document. Please review and process at your earliest convenience.</p>
              <p style="margin:0;font-size:13px;color:#94a3b8;">
                If you have any questions, please reply to this email or contact us directly.
              </p>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding:16px 32px;background:#f8fafc;border-top:1px solid #e2e8f0;text-align:center;">
              <p style="margin:0;font-size:11px;color:#94a3b8;">${companyName} &bull; This is an automated message</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}
