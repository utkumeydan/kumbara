// Derlenmiş web uygulamasını sunan küçük statik sunucu; bilinmeyen yollar index.html'e düşer
import { createReadStream, existsSync, readFileSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize } from 'node:path';

const root = new URL('./.web', import.meta.url).pathname;
const port = Number(process.env.PORT ?? 8100);
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.ico': 'image/x-icon', '.ttf': 'font/ttf', '.svg': 'image/svg+xml' };

// Üretimdeki nginx başlıkları; testte API ayrı adreste olduğu için connect-src'ye eklenir
const api = process.env.E2E_API_ORIGIN ?? 'http://localhost:3100';
const security = Object.fromEntries(
  [...readFileSync(new URL('../apps/mobile/security-headers.conf', import.meta.url), 'utf8').matchAll(/^add_header (\S+) "([^"]*)"/gm)].map(([, k, v]) => [k, k === 'Content-Security-Policy' ? v.replace("connect-src 'self'", `connect-src 'self' ${api}`) : v]),
);

createServer((req, res) => {
  const path = normalize(decodeURIComponent((req.url ?? '/').split('?')[0])).replace(/^(\.\.[/\\])+/, '');
  let file = join(root, path);
  if (!existsSync(file) || statSync(file).isDirectory()) file = join(root, 'index.html');
  res.writeHead(200, { ...security, 'Content-Type': types[extname(file)] ?? 'application/octet-stream' });
  createReadStream(file).pipe(res);
}).listen(port, () => console.log(`web ${port}`));
