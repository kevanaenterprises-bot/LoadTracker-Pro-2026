/**
 * Christy — LiveAvatar AI Backend
 * Handles HeyGen LiveAvatar sessions + OpenClaw AI brain
 * Runs as a separate service (port 3002) or can be merged into main server
 */

import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.CHRISTY_PORT || 3002;

app.use(cors());
app.use(express.json());

const HEYGEN_API_KEY = process.env.HEYGEN_API_KEY || process.env.VITE_HEYGEN_API_KEY;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

// Christy's avatar ID — set once Christy's custom avatar is ready
// Falls back to Caroline Office Sitting Front (professional office look)
const CHRISTY_AVATAR_ID = process.env.CHRISTY_AVATAR_ID || 'Caroline_Office_Sitting_Front_public';
const CHRISTY_VOICE_ID  = process.env.CHRISTY_VOICE_ID  || '60d9ae36173d415db7a3d851bfd57f87'; // Ginger - warm female

// Load system prompt
const SYSTEM_PROMPT = fs.readFileSync(path.join(__dirname, 'system-prompt.md'), 'utf8');

// Load today's briefing if available
function getDailyContext() {
  try {
    const briefingFile = path.join(__dirname, 'daily-context.json');
    if (!fs.existsSync(briefingFile)) return '';
    const b = JSON.parse(fs.readFileSync(briefingFile, 'utf8'));
    // Only use if generated today
    const genDate = new Date(b.generated_at);
    const now = new Date();
    if (now - genDate > 36 * 60 * 60 * 1000) return ''; // stale if >36h old

    let ctx = `\n\n## Today's Briefing (${b.date})\n`;
    if (b.weather) ctx += `- Weather in Dallas: ${b.weather}\n`;
    if (b.diesel_price) ctx += `- Current diesel price: ${b.diesel_price}\n`;
    if (b.trucking_news?.length) ctx += `- Trucking news: ${b.trucking_news.join(' | ')}\n`;
    if (b.today_in_history?.length) ctx += `- Today in history: ${b.today_in_history.join(' | ')}\n`;
    if (b.talking_points?.length) ctx += `\nNatural talking points you can weave in:\n${b.talking_points.map(p => `- "${p}"`).join('\n')}\n`;
    return ctx;
  } catch { return ''; }
}

// ── Day/Night check ─────────────────────────────────────────────────────────
function isOfficeHours() {
  // 8am–6pm CST (UTC-6)
  const now = new Date();
  const cstHour = (now.getUTCHours() - 6 + 24) % 24;
  return cstHour >= 8 && cstHour < 18;
}

// ── HeyGen LiveAvatar Session ───────────────────────────────────────────────

// Create a new LiveAvatar session
app.post('/api/christy/session/start', async (req, res) => {
  try {
    if (!HEYGEN_API_KEY) return res.status(503).json({ error: 'HeyGen API key not configured' });

    const response = await fetch('https://api.heygen.com/v1/streaming.new', {
      method: 'POST',
      headers: {
        'X-Api-Key': HEYGEN_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        quality: 'medium',
        avatar_id: CHRISTY_AVATAR_ID,
        voice: { voice_id: CHRISTY_VOICE_ID },
        background: {
          type: 'color',
          value: isOfficeHours() ? '#f8fafc' : '#1e293b',
        },
        version: 'v2',
        video_encoding: 'H264',
      }),
    });

    const data = await response.json();
    if (!response.ok) {
      console.error('[Christy] Session start error:', data);
      return res.status(response.status).json({ error: data.message || 'Failed to start session' });
    }

    console.log('[Christy] Session started:', data.data?.session_id);
    res.json({
      session_id: data.data?.session_id,
      sdp: data.data?.sdp,
      ice_servers: data.data?.ice_servers,
      office_hours: isOfficeHours(),
    });
  } catch (err) {
    console.error('[Christy] Session start error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Start streaming (WebRTC handshake)
app.post('/api/christy/session/connect', async (req, res) => {
  try {
    const { session_id, sdp } = req.body;
    const response = await fetch('https://api.heygen.com/v1/streaming.start', {
      method: 'POST',
      headers: { 'X-Api-Key': HEYGEN_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id, sdp }),
    });
    const data = await response.json();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ICE candidate exchange
app.post('/api/christy/session/ice', async (req, res) => {
  try {
    const { session_id, candidate } = req.body;
    const response = await fetch('https://api.heygen.com/v1/streaming.ice', {
      method: 'POST',
      headers: { 'X-Api-Key': HEYGEN_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id, candidate }),
    });
    const data = await response.json();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Send text for Christy to speak
app.post('/api/christy/speak', async (req, res) => {
  try {
    const { session_id, text } = req.body;
    if (!session_id || !text) return res.status(400).json({ error: 'session_id and text required' });

    const response = await fetch('https://api.heygen.com/v1/streaming.task', {
      method: 'POST',
      headers: { 'X-Api-Key': HEYGEN_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id, text, task_type: 'talk' }),
    });
    const data = await response.json();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Stop session
app.post('/api/christy/session/stop', async (req, res) => {
  try {
    const { session_id } = req.body;
    const response = await fetch('https://api.heygen.com/v1/streaming.stop', {
      method: 'POST',
      headers: { 'X-Api-Key': HEYGEN_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id }),
    });
    const data = await response.json();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── AI Brain — Christy's responses ─────────────────────────────────────────

app.post('/api/christy/chat', async (req, res) => {
  try {
    const { message, history = [] } = req.body;
    if (!message) return res.status(400).json({ error: 'message required' });

    const officeHours = isOfficeHours();

    // Build conversation history
    const messages = [
      { role: 'system', content: SYSTEM_PROMPT + getDailyContext() + `\n\nCurrent time: ${officeHours ? 'Office hours (8am-6pm CST) — you are fully present and energetic.' : 'After hours (6pm-8am CST) — you are in warm out-of-office mode.'}` },
      ...history.slice(-8), // Keep last 8 exchanges for context
      { role: 'user', content: message },
    ];

    // Use OpenAI if available, otherwise use a smart fallback
    if (OPENAI_API_KEY) {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${OPENAI_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages,
          max_tokens: 300,
          temperature: 0.85,
        }),
      });
      const data = await response.json();
      const fullResponse = data.choices?.[0]?.message?.content || '';

      // Extract just the Response section (strip Reasoning for spoken output)
      const responseMatch = fullResponse.match(/\*\*Response:\*\*\s*([\s\S]+?)(?:\*\*|$)/i);
      const spokenText = responseMatch ? responseMatch[1].trim() : fullResponse;

      res.json({ text: spokenText, full: fullResponse, office_hours: officeHours });
    } else {
      // Fallback responses when no OpenAI key
      const fallbacks = officeHours ? [
        "Oh hey, great question! LoadTracker PRO is built for real operators — everything from dispatch to invoicing to IFTA in one place. Have you tried the free demo yet? It's at TurtleLogisticsLLC.com — no salesman, I promise! 😄",
        "That's exactly what I love showing people! The GPS geofencing automatically stamps arrival and departure times — no more drivers forgetting to log in. Want me to walk you through it in the demo?",
        "IFTA used to be a nightmare for a lot of our customers. Now it's just... done. Built right in, quarterly reports generate automatically. And yes, it's included — not an add-on! 🚛",
      ] : [
        "Hey! Office is closed for the night but I'm glad you stopped by 😊 The demo is still running — go ahead and explore everything at TurtleLogisticsLLC.com. Leave me a note and I'll get back to you first thing in the morning!",
      ];
      const text = fallbacks[Math.floor(Math.random() * fallbacks.length)];
      res.json({ text, office_hours: officeHours });
    }
  } catch (err) {
    console.error('[Christy] Chat error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── Status ──────────────────────────────────────────────────────────────────
app.get('/api/christy/status', (req, res) => {
  res.json({
    online: true,
    office_hours: isOfficeHours(),
    avatar_id: CHRISTY_AVATAR_ID,
    heygen_configured: !!HEYGEN_API_KEY,
    ai_configured: !!OPENAI_API_KEY,
  });
});

// ── Visitor notification (fires when someone lands on the site) ─────────────
app.post('/api/christy/visitor', async (req, res) => {
  const { referrer, page } = req.body;
  console.log(`[Christy] New visitor from ${referrer || 'direct'} on ${page || '/'}`);
  // Could trigger a webhook, log to DB, etc.
  res.json({ acknowledged: true, office_hours: isOfficeHours() });
});

app.listen(PORT, () => {
  console.log(`🌟 Christy server running on port ${PORT}`);
  console.log(`   Avatar: ${CHRISTY_AVATAR_ID}`);
  console.log(`   Office hours: ${isOfficeHours() ? '✅ YES' : '🌙 NO (after hours)'}`);
});
