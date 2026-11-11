import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { join, extname } from 'path';
import store from './routes/store.ts';
import translate from './routes/translate.ts';

const app = new Hono();
const isProd = process.env.NODE_ENV === 'production';

app.use('*', logger());
app.use(
  '*',
  cors({
    origin: isProd
      ? '*'
      : ['http://localhost:5173', 'http://localhost:4173', 'http://localhost:3001'],
    allowHeaders: ['Content-Type', 'X-Store-Url', 'X-Store-User', 'X-Store-Password'],
  }),
);

app.get('/health', (c) => c.json({ ok: true }));
app.route('/api/store', store);
app.route('/api/translate', translate);

// Serve built frontend in production (Docker / hosted web)
if (isProd) {
  const staticRoot = join(import.meta.dir, '../public');

  const mimeTypes: Record<string, string> = {
    '.html': 'text/html; charset=utf-8',
    '.js':   'application/javascript; charset=utf-8',
    '.mjs':  'application/javascript; charset=utf-8',
    '.css':  'text/css; charset=utf-8',
    '.json': 'application/json',
    '.png':  'image/png',
    '.jpg':  'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.svg':  'image/svg+xml',
    '.ico':  'image/x-icon',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
  };

  app.use('/*', async (c) => {
    const pathname = new URL(c.req.url).pathname;
    const ext = extname(pathname);
    const filePath = ext ? join(staticRoot, pathname) : join(staticRoot, 'index.html');
    const file = Bun.file(filePath);
    if (ext && !(await file.exists())) return c.notFound();
    const contentType = mimeTypes[ext] ?? 'text/html; charset=utf-8';
    return new Response(file, { headers: { 'Content-Type': contentType } });
  });
}

export default app;
