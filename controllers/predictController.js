import Transaction from '../models/Transaction.js';

function daysBetween(a, b) {
  const ms = Math.abs(b.getTime() - a.getTime());
  return Math.max(1, Math.ceil(ms / (1000 * 60 * 60 * 24)));
}

async function callGemini(prompt) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY not set');

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${encodeURIComponent(apiKey)}`;
  console.log('[predict] callGemini: sending request (promptChars=%d)', (prompt || '').length);
  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.2 },
    }),
  });
  console.log('[predict] callGemini: HTTP status %d', resp.status);
  if (!resp.ok) throw new Error(`Gemini error: ${resp.status}`);
  const data = await resp.json();
  console.log("Gemini response:", data);
  const text = data?.candidates?.[0]?.content?.parts?.map((p) => p?.text || '').join('') || '';
  return text;
}

function computeHeuristic(transactions) {
  // Aggregate by category and overall across the window
  const byCategory = new Map();
  let firstDate = null;
  let lastDate = null;

  for (const t of transactions) {
    const d = new Date(t.date);
    if (!firstDate || d < firstDate) firstDate = d;
    if (!lastDate || d > lastDate) lastDate = d;

    const cat = String(t.category || 'uncategorized');
    const amt = Number(t.amount) || 0;

    byCategory.set(cat, (byCategory.get(cat) || 0) + amt);
  }

  if (!firstDate || !lastDate) {
    return {
      daysAnalyzed: 0,
      predictedNextMonthTotal: 0,
      categoryBreakdown: {},
      method: 'heuristic',
    };
  }

  const windowDays = daysBetween(firstDate, lastDate) + 1;
  const categoryAverages = {};
  let totalAvgPerDay = 0;

  for (const [cat, total] of byCategory.entries()) {
    const avgPerDay = total / windowDays;
    categoryAverages[cat] = {
      total: Number(total.toFixed(2)),
      avgPerDay: Number(avgPerDay.toFixed(4)),
      predictedNext30Days: Number((avgPerDay * 30).toFixed(2)),
    };
    totalAvgPerDay += avgPerDay;
  }

  const predictedNextMonthTotal = Number((totalAvgPerDay * 30).toFixed(2));

  return {
    daysAnalyzed: windowDays,
    predictedNextMonthTotal,
    categoryBreakdown: categoryAverages,
    method: 'heuristic',
  };
}

async function callOpenAI(prompt) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY not set');

  const resp = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-3.5-turbo',
      messages: [
        { role: 'system', content: 'You are an assistant that predicts monthly expenses from recent transaction summaries.' },
        { role: 'user', content: prompt },
      ],
      temperature: 0.2,
    }),
  });

  if (!resp.ok) throw new Error(`OpenAI error: ${resp.status}`);
  const data = await resp.json();
  const content = data?.choices?.[0]?.message?.content || '';
  return content;
}

export const predictExpenses = async (req, res, next) => {
  try {
    const userId = req.user?.userId;
    const { days = 90, useOpenAI = false, useGemini = false } = req.body || {};
    console.log('[predict] request body ->', { days, useOpenAI, useGemini });

    const since = new Date();
    since.setDate(since.getDate() - Math.max(7, Math.min(180, Number(days) || 90)));

    const transactions = await Transaction.find({ userId, date: { $gte: since } }).sort({ date: 1 });

    // Free heuristic by default
    const heuristic = computeHeuristic(transactions);

    if (!useOpenAI && !useGemini) {
      console.log('[predict] using heuristic only (no provider requested)');
      return res.status(200).json({ prediction: heuristic, source: 'heuristic' });
    }

    // Build prompt once, used by either provider
    const summary = {
      daysAnalyzed: heuristic.daysAnalyzed,
      categories: Object.fromEntries(
        Object.entries(heuristic.categoryBreakdown).map(([k, v]) => [k, { total: v.total }])
      ),
    };

    const prompt = `Given the recent spending summary over ${heuristic.daysAnalyzed} days: ${JSON.stringify(
      summary
    )}, predict the total spending for the next 30 days and a simple per-category breakdown as JSON in the shape { total:number, categories: { [category:string]: number } }. Do not include any text besides pure JSON.`;

    let aiJson = null;
    try {
      let content = '';
      if (useGemini) {
        if (!process.env.GEMINI_API_KEY) {
          console.warn('[predict] GEMINI_API_KEY not set; falling back to heuristic');
          return res.status(200).json({ prediction: heuristic, source: 'heuristic', note: 'GEMINI_API_KEY not set; returned heuristic.' });
        }
        console.log('[predict] invoking Gemini provider');
        content = await callGemini(prompt);
      } else if (useOpenAI) {
        if (!process.env.OPENAI_API_KEY) {
          console.warn('[predict] OPENAI_API_KEY not set; falling back to heuristic');
          return res.status(200).json({ prediction: heuristic, source: 'heuristic', note: 'OPENAI_API_KEY not set; returned heuristic.' });
        }
        console.log('[predict] invoking OpenAI provider');
        content = await callOpenAI(prompt);
      }
      // Try to parse JSON from the model reply
      const start = content.indexOf('{');
      const end = content.lastIndexOf('}');
      if (start !== -1 && end !== -1) {
        aiJson = JSON.parse(content.slice(start, end + 1));
      }
    } catch (e) {
      // Swallow provider errors and fall back to heuristic
      console.error('[predict] provider error:', e?.message || e);
    }

    if (!aiJson || typeof aiJson.total !== 'number') {
      console.log('[predict] invalid/empty AI JSON; returning heuristic');
      return res.status(200).json({ prediction: heuristic, source: 'heuristic' });
    }

    return res.status(200).json({
      prediction: {
        daysAnalyzed: heuristic.daysAnalyzed,
        predictedNextMonthTotal: Number(aiJson.total.toFixed ? aiJson.total.toFixed(2) : aiJson.total),
        categoryBreakdown: Object.fromEntries(
          Object.entries(aiJson.categories || {}).map(([k, v]) => [k, Number(Number(v).toFixed(2))])
        ),
        method: useGemini ? 'gemini' : 'openai',
      },
      source: useGemini ? 'gemini' : 'openai',
    });
  } catch (error) {
    return next(error);
  }
};
