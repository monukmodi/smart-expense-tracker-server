// Very lightweight schemas without external libraries.
// Each schema is a function that receives data and returns { value, error }

function isEmail(str) {
  return typeof str === 'string' && /.+@.+\..+/.test(str);
}

function isISODate(str) {
  if (typeof str !== 'string') return false;
  const d = new Date(str);
  return !isNaN(d.getTime());
}

function sanitizeString(s, { min = 0, max = 200 } = {}) {
  if (typeof s !== 'string') return null;
  const t = s.trim();
  if (t.length < min || t.length > max) return null;
  return t;
}

export const schemas = {
  register(body) {
    const name = sanitizeString(body?.name, { min: 1, max: 100 });
    const email = body?.email;
    const password = String(body?.password || '');
    if (!name) return { error: 'name is required (1-100 chars)' };
    if (!isEmail(email)) return { error: 'email must be a valid email' };
    if (password.length < 6) return { error: 'password must be at least 6 characters' };
    return { value: { name, email: String(email).toLowerCase().trim(), password } };
  },

  login(body) {
    const email = body?.email;
    const password = String(body?.password || '');
    if (!isEmail(email)) return { error: 'email must be a valid email' };
    if (!password) return { error: 'password is required' };
    return { value: { email: String(email).toLowerCase().trim(), password } };
  },

  txCreate(body) {
    const amount = Number(body?.amount);
    const category = sanitizeString(body?.category, { min: 1, max: 100 });
    const description = sanitizeString(body?.description ?? '', { max: 500 }) ?? '';
    const date = body?.date;

    if (!isFinite(amount) || amount <= 0) return { error: 'amount must be a number > 0' };
    if (!category) return { error: 'category is required' };
    if (date && !isISODate(date)) return { error: 'date must be ISO date string' };

    return { value: { amount, category, description, ...(date ? { date } : {}) } };
  },

  txUpdate(body) {
    const out = {};
    if ('amount' in body) {
      const amount = Number(body.amount);
      if (!isFinite(amount) || amount <= 0) return { error: 'amount must be a number > 0' };
      out.amount = amount;
    }
    if ('category' in body) {
      const category = sanitizeString(body.category, { min: 1, max: 100 });
      if (!category) return { error: 'category must be non-empty string' };
      out.category = category;
    }
    if ('description' in body) {
      const description = sanitizeString(body.description ?? '', { max: 500 });
      out.description = description ?? '';
    }
    if ('date' in body) {
      if (body.date && !isISODate(body.date)) return { error: 'date must be ISO date string' };
      out.date = body.date;
    }
    return { value: out };
  },

  txQuery(query) {
    const out = {};
    if (query?.category) out.category = String(query.category);
    if (query?.from) {
      if (!isISODate(query.from)) return { error: 'from must be ISO date string' };
      out.from = query.from;
    }
    if (query?.to) {
      if (!isISODate(query.to)) return { error: 'to must be ISO date string' };
      out.to = query.to;
    }
    // Pagination
    let limit = query?.limit != null ? Number(query.limit) : 20;
    let offset = query?.offset != null ? Number(query.offset) : 0;
    if (!isFinite(limit) || limit <= 0) limit = 20;
    if (!isFinite(offset) || offset < 0) offset = 0;
    limit = Math.min(100, Math.max(1, Math.floor(limit)));
    offset = Math.max(0, Math.floor(offset));
    out.limit = limit;
    out.offset = offset;
    return { value: out };
  },

  predict(body) {
    let days = Number(body?.days ?? 90);
    if (!isFinite(days)) days = 90;
    days = Math.max(7, Math.min(180, Math.floor(days)));
    const useOpenAI = Boolean(body?.useOpenAI);
    return { value: { days, useOpenAI } };
  },
};
