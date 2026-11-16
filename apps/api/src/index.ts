import { serve } from '@hono/node-server';
import { app } from './app.js';
import { cleanupDemos } from './lib/demo.js';
import { sendDueReminders } from './lib/reminders.js';

const port = Number(process.env.PORT ?? 3000);
serve({ fetch: app.fetch, port, hostname: '0.0.0.0' }, () => console.log(`API ${port} portunda çalışıyor`));

// Eski demo hesapları saatte bir temizlenir
setInterval(() => cleanupDemos().catch((e) => console.error('Demo temizliği başarısız', e)), 3_600_000).unref();

// Push ile ödeme hatırlatmaları (kişinin yerel saatiyle 09:00)
setInterval(() => sendDueReminders().catch((e) => console.error('Hatırlatma gönderilemedi', e)), 15 * 60_000).unref();
