import type { Context } from 'hono';
import { createMiddleware } from 'hono/factory';
import { HTTPException } from 'hono/http-exception';

const buckets = new Map<string, { count: number; reset: number }>();

// Bellek içi sabit pencere sınırlayıcı; tek sunuculu kurulum için yeterli
export function rateLimit(name: string, max: number, windowMs: number, key: (c: Context) => Promise<string> | string) {
  return createMiddleware(async (c, next) => {
    const id = `${name}:${await key(c)}`;
    const now = Date.now();
    const b = buckets.get(id);
    if (!b || b.reset < now) buckets.set(id, { count: 1, reset: now + windowMs });
    else if (++b.count > max) {
      c.header('Retry-After', String(Math.ceil((b.reset - now) / 1000)));
      throw new HTTPException(429, { message: 'Çok fazla deneme. Biraz sonra tekrar dene.' });
    }
    await next();
  });
}

export function clientIp(c: Context) {
  return c.req.header('X-Forwarded-For')?.split(',')[0].trim() ?? c.req.header('X-Real-IP') ?? 'local';
}

// Eski kayıtları ara sıra temizler
setInterval(() => {
  const now = Date.now();
  for (const [k, b] of buckets) if (b.reset < now) buckets.delete(k);
}, 600_000).unref();
