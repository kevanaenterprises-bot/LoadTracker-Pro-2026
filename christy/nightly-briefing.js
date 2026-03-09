/**
 * Christy's Nightly Briefing
 * Runs every night at 11pm CST — feeds her world events, trucking news,
 * weather, and a "today in history" fact so she's sharp the next morning.
 *
 * Run via cron: node christy/nightly-briefing.js
 * Or schedule: 0 5 * * * (5am UTC = 11pm CST)
 */

import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BRIEFING_FILE = path.join(__dirname, 'daily-context.json');

async function fetchTruckingNews() {
  // Use NewsAPI or RSS — falls back to hardcoded topics if unavailable
  const NEWS_API_KEY = process.env.NEWS_API_KEY;
  if (!NEWS_API_KEY) return null;

  try {
    const r = await fetch(
      `https://newsapi.org/v2/everything?q=trucking+freight+logistics&sortBy=publishedAt&pageSize=5&apiKey=${NEWS_API_KEY}`,
      { signal: AbortSignal.timeout(10000) }
    );
    const d = await r.json();
    return d.articles?.map(a => `${a.title} (${a.source?.name})`).slice(0, 3) || null;
  } catch { return null; }
}

async function fetchWeather() {
  // Dallas weather for Christy's "office"
  try {
    const r = await fetch('https://wttr.in/Dallas,TX?format=3', { signal: AbortSignal.timeout(8000) });
    return await r.text();
  } catch { return null; }
}

async function fetchTodayInHistory() {
  try {
    const now = new Date();
    const month = now.getMonth() + 1;
    const day = now.getDate();
    const r = await fetch(`https://history.muffinlabs.com/date/${month}/${day}`, { signal: AbortSignal.timeout(8000) });
    const d = await r.json();
    const events = d.data?.Events?.slice(0, 2) || [];
    return events.map(e => `${e.year}: ${e.text}`);
  } catch { return null; }
}

async function fetchFuelPrices() {
  // EIA weekly diesel price (free, no key needed)
  try {
    const r = await fetch(
      'https://api.eia.gov/v2/petroleum/pri/gnd/data/?frequency=weekly&data[0]=value&facets[product][]=DPM&facets[duoarea][]=R30&sort[0][column]=period&sort[0][direction]=desc&offset=0&length=1',
      { signal: AbortSignal.timeout(8000) }
    );
    if (!r.ok) return null;
    const d = await r.json();
    const price = d.response?.data?.[0]?.value;
    return price ? `$${price}/gallon (US avg diesel, latest weekly)` : null;
  } catch { return null; }
}

async function buildBriefing() {
  console.log('🌙 Building Christy\'s nightly briefing...');

  const [news, weather, history, diesel] = await Promise.all([
    fetchTruckingNews(),
    fetchWeather(),
    fetchTodayInHistory(),
    fetchFuelPrices(),
  ]);

  const now = new Date();
  const dateStr = now.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: 'America/Chicago' });

  const briefing = {
    generated_at: now.toISOString(),
    date: dateStr,
    weather: weather || 'Weather data unavailable',
    diesel_price: diesel || null,
    trucking_news: news || [],
    today_in_history: history || [],

    // Conversation starters Christy can use naturally
    talking_points: [
      weather ? `It's ${weather.trim()} in Dallas today — ${weather.includes('sun') || weather.includes('clear') ? 'beautiful day for a haul' : 'glad I\'m in the office'}!` : null,
      diesel ? `Diesel's sitting at ${diesel} — I always keep an eye on that since it affects fuel surcharges for a lot of our customers.` : null,
      news?.[0] ? `Saw some news this morning about the freight market — ${news[0]}` : null,
    ].filter(Boolean),
  };

  fs.writeFileSync(BRIEFING_FILE, JSON.stringify(briefing, null, 2));
  console.log('✅ Briefing saved to', BRIEFING_FILE);
  console.log('   Date:', dateStr);
  console.log('   Weather:', weather || 'N/A');
  console.log('   Diesel:', diesel || 'N/A');
  console.log('   News items:', news?.length || 0);
  console.log('   History events:', history?.length || 0);

  return briefing;
}

buildBriefing()
  .then(() => process.exit(0))
  .catch(e => { console.error('Briefing error:', e); process.exit(1); });
