import type { NextFunction, Request, Response } from 'express';

type Bucket = {
  count: number;
  resetAt: number;
};

const buckets = new Map<string, Bucket>();

const WINDOW_MS = 15 * 60 * 1000;
const CLEANUP_MS = 5 * 60 * 1000;
let lastCleanup = 0;

const SENSITIVE_PATHS = [
  '/api/auth/login',
  '/api/auth/refresh',
  '/api/auth/forgot-password',
  '/api/auth/reset-password',
  '/api/auth/select-sede',
];

function clientIp(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (Array.isArray(forwarded)) return forwarded[0] ?? req.ip ?? 'unknown';
  if (forwarded) return forwarded.split(',')[0]?.trim() || req.ip || 'unknown';
  return req.ip || req.socket.remoteAddress || 'unknown';
}

// IPs de loopback (desarrollo local). En producción detrás de un proxy, clientIp
// devuelve la IP real vía x-forwarded-for, no loopback, así que el límite sigue
// aplicando a los usuarios reales.
function isLoopback(ip: string): boolean {
  return (
    ip === '127.0.0.1' ||
    ip === '::1' ||
    ip === '::ffff:127.0.0.1' ||
    ip === 'localhost'
  );
}

// Permite desactivar el rate-limit explícitamente (p. ej. en desarrollo) con
// RATE_LIMIT_DISABLED=true.
const RATE_LIMIT_DISABLED =
  String(process.env.RATE_LIMIT_DISABLED || '').toLowerCase() === 'true';

function cleanup(now: number) {
  if (now - lastCleanup < CLEANUP_MS) return;
  lastCleanup = now;
  for (const [key, bucket] of buckets.entries()) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}

export function authRateLimit() {
  return (req: Request, res: Response, next: NextFunction) => {
    if (req.method === 'OPTIONS') return next();

    const path = req.path || req.originalUrl || '';
    const isSensitive = SENSITIVE_PATHS.some((item) => path.startsWith(item));
    if (!isSensitive) return next();

    const ip = clientIp(req);
    // En desarrollo local (loopback) o si se desactiva por env, no se aplica el
    // límite: evita bloquear al desarrollador tras varios intentos de login.
    if (RATE_LIMIT_DISABLED || isLoopback(ip)) return next();

    const now = Date.now();
    cleanup(now);

    const key = `${ip}:${path}`;
    const current = buckets.get(key);
    const bucket =
      current && current.resetAt > now
        ? current
        : { count: 0, resetAt: now + WINDOW_MS };

    bucket.count += 1;
    buckets.set(key, bucket);

    const limit = path.startsWith('/api/auth/login') ? 10 : 30;
    if (bucket.count > limit) {
      res.setHeader('Retry-After', Math.ceil((bucket.resetAt - now) / 1000));
      return res.status(429).json({
        code: 0,
        message: 'Demasiados intentos. Intenta nuevamente en unos minutos.',
        error: 'TooManyRequests',
      });
    }

    next();
  };
}
