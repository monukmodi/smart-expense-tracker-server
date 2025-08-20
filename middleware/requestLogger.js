// Simple request logging middleware (no external deps)
export function requestLogger(req, res, next) {
  const start = process.hrtime.bigint();
  const { method, originalUrl } = req;

  res.on('finish', () => {
    const durationMs = Number(process.hrtime.bigint() - start) / 1_000_000;
    const log = {
      time: new Date().toISOString(),
      method,
      url: originalUrl,
      status: res.statusCode,
      durationMs: Number(durationMs.toFixed(2)),
    };
    // eslint-disable-next-line no-console
    console.log(JSON.stringify(log));
  });

  next();
}
