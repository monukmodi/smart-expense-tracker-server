// Simple request logging middleware (no external deps)
export function requestLogger(req, res, next) {
  const start = process.hrtime.bigint();
  const { method, originalUrl } = req;

  res.on('finish', () => {
    const durationMs = Number(process.hrtime.bigint() - start) / 1_000_000;
    const safeBody = (() => {
      if (!req.body || typeof req.body !== 'object') return undefined;
      const clone = { ...req.body };
      // never log passwords or tokens
      if ('password' in clone) clone.password = '<redacted>';
      return clone;
    })();

    const log = {
      time: new Date().toISOString(),
      method,
      url: originalUrl,
      status: res.statusCode,
      durationMs: Number(durationMs.toFixed(2)),
      userId: req.user?.userId || null,
      query: Object.keys(req.query || {}).length ? req.query : undefined,
      body: safeBody,
    };
    // eslint-disable-next-line no-console
    console.log(JSON.stringify(log));
  });

  next();
}
