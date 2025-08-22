import Transaction from '../models/Transaction.js';

// Simple per-user in-memory rate limiter and cache
const rateMap = new Map(); // userId -> { count, resetAt }
const cacheMap = new Map(); // cacheKey -> { data, expiresAt }

const RATE_LIMIT_MAX = 10; // max requests per hour per user
const RATE_WINDOW_MS = 60 * 60 * 1000;
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

function allowRate(userId) {
  const now = Date.now();
  const r = rateMap.get(userId) || { count: 0, resetAt: now + RATE_WINDOW_MS };
  if (now > r.resetAt) {
    r.count = 0;
    r.resetAt = now + RATE_WINDOW_MS;
  }
  r.count += 1;
  rateMap.set(userId, r);
  return r.count <= RATE_LIMIT_MAX;
}

function daysBetween(a, b) {
  const ms = Math.abs(b.getTime() - a.getTime());
  return Math.max(1, Math.ceil(ms / (1000 * 60 * 60 * 24)));
}

function buildCacheKey({ userId, days, provider }) {
  return `${userId}::${days}::${provider || 'heuristic'}`;
}

async function callGemini(prompt) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY not set');
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${encodeURIComponent(apiKey)}`;
  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.2 },
    }),
  });
  if (!resp.ok) throw new Error(`Gemini error: ${resp.status}`);
  const data = await resp.json();
  const text = data?.candidates?.[0]?.content?.parts?.map((p) => p?.text || '').join('') || '';
  return text;
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
        { role: 'system', content: 'You are a budgeting coach that gives concise, actionable tips with estimated savings.' },
        { role: 'user', content: prompt },
      ],
      temperature: 0.2,
    }),
  });
  if (!resp.ok) throw new Error(`OpenAI error: ${resp.status}`);
  const data = await resp.json();
  return data?.choices?.[0]?.message?.content || '';
}

function computeHeuristicCoach(transactions) {
  // Aggregate by category and monthlyize (simple heuristic)
  const byCategory = new Map();
  let firstDate = null;
  let lastDate = null;

  for (const t of transactions) {
    const d = new Date(t.date);
    if (!firstDate || d < firstDate) firstDate = d;
    if (!lastDate || d > lastDate) lastDate = d;
    const cat = String(t.category || 'Other');
    const amt = Number(t.amount) || 0;
    byCategory.set(cat, (byCategory.get(cat) || 0) + amt);
  }

  if (!firstDate || !lastDate) {
    return {
      tips: [],
      savingsEstimate: 0,
      suggestedBudget: {},
      notes: ['Not enough data. Add transactions to get personalized tips.'],
      source: 'heuristic',
    };
  }

  const windowDays = daysBetween(firstDate, lastDate) + 1;
  const monthlyFactor = 30 / windowDays;
  const suggestedBudget = {};
  let savingsEstimate = 0;
  const tips = [];

  for (const [cat, total] of byCategory.entries()) {
    const monthly = total * monthlyFactor;
    let suggested = monthly;
    // Simple rules: trim some common discretionary categories
    if (/food|dining|restaurant|delivery/i.test(cat)) suggested = monthly * 0.85;
    if (/entertainment|shopping/i.test(cat)) suggested = Math.min(suggested, monthly * 0.9);
    if (/transport/i.test(cat)) suggested = Math.min(suggested, monthly * 0.95);

    suggestedBudget[cat] = { current: Number(monthly.toFixed(2)), suggested: Number(suggested.toFixed(2)) };
    savingsEstimate += Math.max(0, monthly - suggested);

    if (suggested < monthly) {
      tips.push({
        title: `Reduce ${cat} by ${(100 - (suggested / monthly) * 100).toFixed(0)}%`,
        detail: `Average monthly spend is ~${monthly.toFixed(0)}. Aim for ~${suggested.toFixed(0)} by planning purchases and avoiding impulse buys.`,
        impact: monthly - suggested > 1000 ? 'high' : 'medium',
        category: cat,
      });
    }
  }

  tips.sort((a, b) => (a.impact === 'high' ? -1 : 1));

  return {
    tips: tips.slice(0, 6),
    savingsEstimate: Number(savingsEstimate.toFixed(2)),
    suggestedBudget,
    notes: ['These suggestions are heuristic; refine with AI providers for deeper personalization.'],
    source: 'heuristic',
  };
}

export async function coach(req, res, next) {
  try {
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ message: 'Unauthorized' });

    // Validate inputs
    const rawDays = Number(req.body?.days ?? 90);
    const days = Math.max(7, Math.min(180, isNaN(rawDays) ? 90 : rawDays));
    const freeOnly = Boolean(req.body?.freeOnly);
    const provider = req.body?.provider || (req.body?.useGemini ? 'gemini' : req.body?.useOpenAI ? 'openai' : 'heuristic');

    // Rate limit
    if (!allowRate(userId)) {
      return res.status(429).json({ message: 'Too many requests. Try again later.' });
    }

    // Cache
    const cacheKey = buildCacheKey({ userId, days, provider: freeOnly ? 'heuristic' : provider });
    const cached = cacheMap.get(cacheKey);
    const now = Date.now();
    if (cached && cached.expiresAt > now) {
      return res.status(200).json({ coach: cached.data, source: cached.data.source, cached: true });
    }

    const since = new Date();
    since.setDate(since.getDate() - days);
    const transactions = await Transaction.find({ userId, date: { $gte: since } }).sort({ date: 1 });

    // Heuristic first
    const heuristic = computeHeuristicCoach(transactions);

    if (freeOnly || provider === 'heuristic' || (!process.env.GEMINI_API_KEY && provider === 'gemini') || (!process.env.OPENAI_API_KEY && provider === 'openai')) {
      cacheMap.set(cacheKey, { data: heuristic, expiresAt: now + CACHE_TTL_MS });
      return res.status(200).json({ coach: heuristic, source: 'heuristic' });
    }

    // Build prompt summary for LLM
    const summary = {
      daysAnalyzed: transactions.length ? daysBetween(new Date(transactions[0].date), new Date(transactions[transactions.length - 1].date)) + 1 : 0,
      categories: Object.fromEntries(Object.entries(heuristic.suggestedBudget).map(([k, v]) => [k, v.current])),
    };

    const prompt = `You are a budgeting assistant. Given user spending over ${summary.daysAnalyzed} days with per-category monthlyized spend ${JSON.stringify(summary.categories)}, return JSON only in shape: { tips: [{title, detail, impact: 'high'|'medium'|'low', category?}], savingsEstimate: number, suggestedBudget: { [category]: { current:number, suggested:number } }, notes: string[] } with concise, actionable tips for next month.`;

    let aiJson = null;
    try {
      let content = '';
      if (provider === 'gemini') {
        content = await callGemini(prompt);
      } else if (provider === 'openai') {
        content = await callOpenAI(prompt);
      }
      const start = content.indexOf('{');
      const end = content.lastIndexOf('}');
      if (start !== -1 && end !== -1) aiJson = JSON.parse(content.slice(start, end + 1));
    } catch (e) {
      // fall back to heuristic
    }

    const result = aiJson && aiJson.tips ? { ...aiJson, source: provider } : heuristic;
    cacheMap.set(cacheKey, { data: result, expiresAt: now + CACHE_TTL_MS });
    return res.status(200).json({ coach: result, source: result.source || provider });
  } catch (err) {
    return next(err);
  }
}
