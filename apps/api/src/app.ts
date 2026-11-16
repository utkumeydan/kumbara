import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { cors } from 'hono/cors';
import { secureHeaders } from 'hono/secure-headers';
import { HTTPException } from 'hono/http-exception';
import { logger } from 'hono/logger';
import { withTimezone } from './lib/auth.js';
import { captureError } from './lib/sentry.js';
import { auth } from './routes/auth.js';
import { backup } from './routes/backup.js';
import { billing } from './routes/billing.js';
import { budget } from './routes/budget.js';
import { debts } from './routes/debts.js';
import { devices } from './routes/devices.js';
import { habits } from './routes/habits.js';
import { importer } from './routes/import.js';
import { insights } from './routes/insights.js';
import { money } from './routes/money.js';
import { spaces } from './routes/spaces.js';
import { spending } from './routes/spending.js';
import { wrapped } from './routes/wrapped.js';

// Üretimde web uygulaması API'yi aynı adresten (/api) çağırır; ayrı istemciler için CORS_ORIGINS verilir
const prod = process.env.NODE_ENV === 'production';
const origins = (process.env.CORS_ORIGINS ?? (prod ? (process.env.APP_URL ?? '') : '*')).split(',').map((s) => s.trim()).filter(Boolean);

const tooLarge = () => {
  throw new HTTPException(413, { message: 'İstek çok büyük' });
};
const apiLimit = bodyLimit({ maxSize: 1024 * 1024, onError: tooLarge });
const restoreLimit = bodyLimit({ maxSize: 25 * 1024 * 1024, onError: tooLarge });

export const app = new Hono()
  .use(process.env.NODE_ENV === 'test' ? (_, next) => next() : logger())
  .use('/api/*', cors({ origin: origins.includes('*') ? '*' : origins, allowHeaders: ['Authorization', 'Content-Type', 'X-Space', 'X-Timezone'] }))
  .use('/api/*', secureHeaders({ crossOriginResourcePolicy: false }))
  // Büyük gövdeyle belleği tüketmeye karşı: yedek geri yükleme dışında 1 MB
  .use('/api/*', (c, next) => (c.req.path === '/api/restore' ? restoreLimit(c, next) : apiLimit(c, next)))
  .use('/api/*', withTimezone)
  .get('/health', (c) => c.json({ ok: true }))
  .route('/api/auth', auth)
  .route('/api', billing)
  .route('/api', devices)
  .route('/api', spaces)
  .route('/api', budget)
  .route('/api', insights)
  .route('/api', debts)
  .route('/api', importer)
  .route('/api', habits)
  .route('/api', backup)
  .route('/api', money)
  .route('/api', spending)
  .route('/api', wrapped);

app.onError((err, c) => {
  if (err instanceof HTTPException) return c.json({ error: err.message }, err.status);
  console.error(err);
  captureError(err, { path: c.req.path, method: c.req.method });
  return c.json({ error: 'Sunucu hatası' }, 500);
});
