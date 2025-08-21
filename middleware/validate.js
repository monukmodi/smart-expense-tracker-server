// Lightweight validation middleware without external deps
// Usage: validate(schemas.register, 'body')

export const validate = (schema, where = 'body') => (req, res, next) => {
  try {
    const data = req[where] ?? {};
    const { value, error } = schema(data);
    if (error) {
      // Log validation details server-side for debugging
      try {
        const log = {
          time: new Date().toISOString(),
          level: 'warn',
          type: 'validation',
          method: req.method,
          url: req.originalUrl,
          where,
          message: error,
          userId: req.user?.userId || null,
        };
        // eslint-disable-next-line no-console
        console.warn(JSON.stringify(log));
      } catch (_) {}
      return res.status(400).json({ message: error });
    }
    req[where] = value; // sanitized
    return next();
  } catch (e) {
    // Log unexpected validation exception; keep client response generic
    try {
      const log = {
        time: new Date().toISOString(),
        level: 'error',
        type: 'validation_exception',
        method: req.method,
        url: req.originalUrl,
        where,
        err: e?.message || String(e),
        userId: req.user?.userId || null,
      };
      if (process.env.NODE_ENV !== 'production' && e?.stack) log.stack = e.stack;
      // eslint-disable-next-line no-console
      console.error(JSON.stringify(log));
    } catch (_) {}
    return res.status(400).json({ message: 'Invalid request payload.' });
  }
};
