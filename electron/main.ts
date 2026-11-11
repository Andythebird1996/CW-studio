import { app, BrowserWindow } from 'electron';
import { serve } from '@hono/node-server';
import { readFile } from 'fs/promises';
import { existsSync } from 'fs';
import { join, extname } from 'path';
import { createServer } from 'net';
import honoApp from '../backend/src/app';

function getFreePort(preferred: number): Promise<number> {
  return new Promise((resolve) => {
    const server = createServer();
    server.listen(preferred, () => {
      const port = (server.address() as { port: number }).port;
      server.close(() => resolve(port));
    });
    server.on('error', () => {
      // preferred port busy — let OS assign a free one
      const fallback = createServer();
      fallback.listen(0, () => {
        const port = (fallback.address() as { port: number }).port;
        fallback.close(() => resolve(port));
      });
    });
  });
}

let PORT = 3001;

function getMimeType(filePath: string): string {
  const types: Record<string, string> = {
    '.html': 'text/html; charset=utf-8',
    '.js':   'application/javascript',
    '.mjs':  'application/javascript',
    '.css':  'text/css',
    '.png':  'image/png',
    '.jpg':  'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.svg':  'image/svg+xml',
    '.ico':  'image/x-icon',
    '.woff': 'font/woff',
    '.woff2':'font/woff2',
    '.json': 'application/json',
    '.webp': 'image/webp',
  };
  return types[extname(filePath).toLowerCase()] ?? 'application/octet-stream';
}

async function startServer(): Promise<void> {
  PORT = await getFreePort(parseInt(process.env.PORT ?? '3001', 10));
  const isDev = !app.isPackaged;

  if (!isDev) {
    // In production: serve built frontend as static files for non-API routes
    const distRoot = join(__dirname, '../../frontend/dist');

    honoApp.use('/*', async (c) => {
      const pathname = new URL(c.req.url).pathname;
      const hasExt = extname(pathname) !== '';
      const candidate = join(distRoot, pathname);
      const filePath = (hasExt && existsSync(candidate)) ? candidate : join(distRoot, 'index.html');

      try {
        const content = await readFile(filePath);
        return new Response(content, {
          headers: { 'Content-Type': getMimeType(filePath) },
        });
      } catch {
        return new Response('Not found', { status: 404 });
      }
    });
  }

  serve({ fetch: honoApp.fetch, port: PORT }, () => {
    console.log(`Checkware Studio server running on http://localhost:${PORT}`);
  });
}

async function createWindow(): Promise<void> {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
    title: 'Checkware Studio',
    show: false, // Show only when ready to avoid white flash
  });

  win.once('ready-to-show', () => win.show());

  if (app.isPackaged) {
    // Production: load from our local Hono server (handles both API + static files)
    await win.loadURL(`http://localhost:${PORT}`);
  } else {
    // Development: load from Vite dev server
    await win.loadURL('http://localhost:5173');
    win.webContents.openDevTools();
  }

  win.on('closed', () => app.quit());
}

app.whenReady().then(async () => {
  await startServer();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
