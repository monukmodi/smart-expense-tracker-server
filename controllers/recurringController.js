import Transaction from '../models/Transaction.js';

// In-memory rate limiter and cache
const rateMap = new Map(); // userId -> { count, resetAt }
const cacheMap = new Map(); // key -> { data, expiresAt }
const RATE_LIMIT_MAX = 10;
const RATE_WINDOW_MS = 60 * 60 * 1000; // 1h
const CACHE_TTL_MS = 10 * 60 * 1000; // 10m

function allowRate(userId) {
  const now = Date.now();
  const entry = rateMap.get(userId) || { count: 0, resetAt: now + RATE_WINDOW_MS };
  if (now > entry.resetAt) {
    entry.count = 0;
    entry.resetAt = now + RATE_WINDOW_MS;
  }
  entry.count += 1;
  rateMap.set(userId, entry);
  return entry.count <= RATE_LIMIT_MAX;
}

function buildCacheKey({ userId, days, provider }) {
  return `${userId}::recurring::${days}::${provider || 'heuristic'}`;
}

function detectCadence(dates) {
  // dates sorted ascending
  if (dates.length < 2) return { cadence: 'unknown', days: null, confidence: 0.1 };
  const deltas = [];
  for (let i = 1; i < dates.length; i++) {
    const diffDays = Math.round((dates[i] - dates[i - 1]) / (1000 * 60 * 60 * 24));
    deltas.push(diffDays);
  }
  const avg = deltas.reduce((a, b) => a + b, 0) / deltas.length;
  const variance = deltas.reduce((a, d) => a + Math.pow(d - avg, 2), 0) / deltas.length;
  const std = Math.sqrt(variance);
  const near = (x, target, tol) => Math.abs(x - target) <= tol;

  let cadence = 'unknown';
  let days = Math.round(avg);
  let conf = Math.max(0.1, Math.min(1, 1 / (1 + std)));
  if (near(avg, 30, 3)) { cadence = 'monthly'; days = 30; conf = Math.max(conf, 0.7); }
  else if (near(avg, 28, 3)) { cadence = 'monthly'; days = 28; conf = Math.max(conf, 0.65); }
  else if (near(avg, 14, 2)) { cadence = 'biweekly'; days = 14; conf = Math.max(conf, 0.6); }
  else if (near(avg, 7, 1)) { cadence = 'weekly'; days = 7; conf = Math.max(conf, 0.6); }
  else if (near(avg, 365, 10)) { cadence = 'yearly'; days = 365; conf = Math.max(conf, 0.6); }
  return { cadence, days, confidence: Number(conf.toFixed(2)) };
}

function normalizeMerchant(desc = '') {
  const s = String(desc).toUpperCase();
  return s
    .replace(/\s+/g, ' ')
    .replace(/[*#\-_:]/g, ' ')
    .replace(/\d{2,}/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function heuristicRecurring(transactions) {
  // Group by normalized merchant and category
  const groups = new Map();
  for (const t of transactions) {
    const d = new Date(t.date);
    const key = `${normalizeMerchant(t.description || t.merchant || t.category || 'UNKNOWN')}|${t.category || 'Other'}`;
    const amt = Math.abs(Number(t.amount) || 0);
    if (amt === 0) continue;
    if (!groups.has(key)) groups.set(key, { merchant: key.split('|')[0], category: t.category || 'Other', dates: [], amounts: [] });
    const g = groups.get(key);
    g.dates.push(new Date(d.getFullYear(), d.getMonth(), d.getDate()));
    g.amounts.push(amt);
  }

  const items = [];
  for (const g of groups.values()) {
    g.dates.sort((a, b) => a - b);
    if (g.dates.length < 2) continue; // need at least 2 occurrences
    const { cadence, days, confidence } = detectCadence(g.dates);
    if (cadence === 'unknown') continue;
    const avgAmount = g.amounts.reduce((a, b) => a + b, 0) / g.amounts.length;
    const last = g.dates[g.dates.length - 1];
    const next = new Date(last);
    next.setDate(next.getDate() + (days || 30));
    items.push({
      merchant: g.merchant,
      category: g.category,
      avgAmount: Number(avgAmount.toFixed(2)),
      cadence,
      nextDueDate: next.toISOString(),
      confidence,
      notes: [],
      source: 'heuristic',
    });
  }

  // Sort by nearest due date within next 45 days
  const now = new Date();
  items.sort((a, b) => new Date(a.nextDueDate) - new Date(b.nextDueDate));
  return items.filter((x) => (new Date(x.nextDueDate) - now) / (1000 * 60 * 60 * 24) <= 90).slice(0, 20);
}

async function callGemini(prompt) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY not set');
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${encodeURIComponent(apiKey)}`;
  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature: 0.1 } }),
  });
  if (!resp.ok) throw new Error(`Gemini error: ${resp.status}`);
  const data = await resp.json();
  return data?.candidates?.[0]?.content?.parts?.map((p) => p?.text || '').join('') || '';
}

async function callOpenAI(prompt) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY not set');
  const resp = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'gpt-3.5-turbo',
      messages: [
        { role: 'system', content: 'Detect recurring charges and predict next due dates. Respond with strict JSON.' },
        { role: 'user', content: prompt },
      ],
      temperature: 0.1,
    }),
  });
  if (!resp.ok) throw new Error(`OpenAI error: ${resp.status}`);
  const data = await resp.json();
  return data?.choices?.[0]?.message?.content || '';
}

export async function scanRecurring(req, res, next) {
  try {
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ message: 'Unauthorized' });

    const rawDays = Number(req.body?.days ?? 180);
    const days = Math.max(30, Math.min(365, isNaN(rawDays) ? 180 : rawDays));
    const freeOnly = Boolean(req.body?.freeOnly);
    const provider = req.body?.provider || 'heuristic';

    if (!allowRate(userId)) return res.status(429).json({ message: 'Too many requests. Try again later.' });

    const now = Date.now();
    const effectiveProvider = freeOnly ? 'heuristic' : provider;
    const cacheKey = buildCacheKey({ userId, days, provider: effectiveProvider });
    const cached = cacheMap.get(cacheKey);
    if (cached && cached.expiresAt > now) {
      return res.status(200).json({ items: cached.data, source: 'cache' });
    }

    const since = new Date();
    since.setDate(since.getDate() - days);
    const transactions = await Transaction.find({ userId, date: { $gte: since } }).sort({ date: 1 });

    const heuristicItems = heuristicRecurring(transactions);

    if (effectiveProvider === 'heuristic' || heuristicItems.length === 0) {
      cacheMap.set(cacheKey, { data: heuristicItems, expiresAt: now + CACHE_TTL_MS });
      return res.status(200).json({ items: heuristicItems, source: 'heuristic' });
    }

    // Build prompt for refinement
    const summary = heuristicItems.map((x) => ({
      merchant: x.merchant,
      category: x.category,
      avgAmount: x.avgAmount,
      cadence: x.cadence,
      lastDueDate: null, // omitting for brevity
      nextDueDate: x.nextDueDate,
      confidence: x.confidence,
    }));
    const prompt = `Given these candidate recurring charges: ${JSON.stringify(summary)}, refine and return JSON only in the shape [{ merchant, category, avgAmount, cadence, nextDueDate, confidence, notes }]. Ensure ISO nextDueDate and confidence 0..1.`;

    let aiItems = null;
    try {
      let content = '';
      if (effectiveProvider === 'gemini') content = await callGemini(prompt);
      else if (effectiveProvider === 'openai') content = await callOpenAI(prompt);
      const start = content.indexOf('[');
      const end = content.lastIndexOf(']');
      if (start !== -1 && end !== -1) aiItems = JSON.parse(content.slice(start, end + 1));
    } catch (_) {
      // ignore
    }

    const result = Array.isArray(aiItems) && aiItems.length ? aiItems : heuristicItems;
    cacheMap.set(cacheKey, { data: result, expiresAt: now + CACHE_TTL_MS });
    return res.status(200).json({ items: result, source: effectiveProvider });
  } catch (err) {
    return next(err);
  }
}
