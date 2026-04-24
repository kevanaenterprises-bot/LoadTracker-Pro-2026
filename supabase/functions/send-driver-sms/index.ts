import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const TELNYX_API_KEY = Deno.env.get('TELNYX_API_KEY') ?? '';
const TELNYX_FROM = Deno.env.get('TELNYX_PHONE_NUMBER') ?? '';

function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  if (phone.startsWith('+')) return phone;
  return `+1${digits}`;
}

serve(async (req) => {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  };

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const {
      driverPhone,
      driverName,
      loadNumber,
      origin,
      destination,
      acceptanceUrl,
      totalMiles,
      pickupDate,
      deliveryDate,
    } = await req.json();

    if (!driverPhone || !loadNumber) {
      return new Response(JSON.stringify({ success: false, error: 'Missing driverPhone or loadNumber' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Extract token from acceptanceUrl to build the native app deep link
    let deepLink = '';
    try {
      const url = new URL(acceptanceUrl);
      const token = url.searchParams.get('token');
      if (token) deepLink = `loadtrackerdriver://load?token=${token}`;
    } catch {}

    const milesLine = totalMiles ? `\nMiles: ${totalMiles}` : '';
    const pickupLine = pickupDate ? `\nPickup: ${new Date(pickupDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}` : '';
    const deliveryLine = deliveryDate ? `\nDelivery: ${new Date(deliveryDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}` : '';

    const message = [
      `🚛 LoadTracker Pro — New Load Assigned`,
      ``,
      `Load #: ${loadNumber}`,
      `From: ${origin}`,
      `To: ${destination}`,
      milesLine,
      pickupLine,
      deliveryLine,
      ``,
      deepLink
        ? `Open in app:\n${deepLink}`
        : `Open in browser:\n${acceptanceUrl}`,
      ``,
      `Questions? Call dispatch.`,
    ].filter(line => line !== undefined).join('\n');

    if (!TELNYX_API_KEY || !TELNYX_FROM) {
      console.error('Telnyx not configured');
      return new Response(JSON.stringify({ success: false, error: 'SMS service not configured' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const to = normalizePhone(driverPhone);
    const telnyxRes = await fetch('https://api.telnyx.com/v2/messages', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${TELNYX_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ from: TELNYX_FROM, to, text: message }),
    });

    const result = await telnyxRes.json();

    if (!telnyxRes.ok) {
      console.error('Telnyx error:', result);
      return new Response(JSON.stringify({ success: false, error: result?.errors?.[0]?.detail || 'Telnyx error' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`SMS sent to ${to} for load ${loadNumber}, message ID: ${result.data?.id}`);
    return new Response(JSON.stringify({ success: true, messageId: result.data?.id }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (err: any) {
    console.error('send-driver-sms error:', err);
    return new Response(JSON.stringify({ success: false, error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
