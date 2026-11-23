import 'dotenv/config';
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { attachApiRoutes } from './server/createApiApp.ts';
import { validateAuthConfig } from './server/auth.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function getCliArg(flag: string): string | undefined {
  const args = process.argv.slice(2);
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === flag && i + 1 < args.length) {
      return args[i + 1];
    }
    if (arg.startsWith(`${flag}=`)) {
      return arg.slice(flag.length + 1);
    }
  }
  return undefined;
}

async function startServer() {
  validateAuthConfig();
  const app = express();
  attachApiRoutes(app);

  // Frontend Serving (Vite dev middlewares in development, dist/ static files in production)
  const isAdminHost = (hostname: string | undefined) => {
    const h = (hostname || '').toLowerCase();
    return h.startsWith('admin.') || h.includes('.admin.') || h.includes('-admin.');
  };
  const isAdminPath = (reqPath: string) =>
    reqPath === '/admin' || reqPath === '/admin/' || reqPath.startsWith('/admin/');

  const isProduction = process.env.NODE_ENV === 'production';
  let viteServer: { close: () => Promise<void> } | null = null;

  if (!isProduction) {
    // Route /admin, /admin/*, or admin.* / -admin.* subdomains to admin.html
    app.use((req, _res, next) => {
      if (
        req.method === 'GET' &&
        !req.path.startsWith('/api/') &&
        (isAdminPath(req.path) || ((req.path === '/' || req.path === '/index.html') && isAdminHost(req.hostname)))
      ) {
        req.url = '/admin.html';
      }
      next();
    });

    app.get('/@vite/client', (_req, res) => {
      res.type('application/javascript').send(`
const sheetsMap = new Map();
if (typeof document !== 'undefined') {
  document.querySelectorAll('style[data-vite-dev-id]').forEach((el) => {
    sheetsMap.set(el.getAttribute('data-vite-dev-id'), el);
  });
}
export function updateStyle(id, content) {
  if (typeof document === 'undefined') return;
  let style = sheetsMap.get(id);
  if (!style) {
    style = document.createElement('style');
    style.setAttribute('type', 'text/css');
    style.setAttribute('data-vite-dev-id', id);
    style.textContent = content;
    document.head.appendChild(style);
  } else if (style.textContent !== content) {
    style.textContent = content;
  }
  sheetsMap.set(id, style);
}
export function removeStyle(id) {
  const style = sheetsMap.get(id);
  if (style && style.parentNode) {
    style.parentNode.removeChild(style);
    sheetsMap.delete(id);
  }
}
export function createHotContext() {
  return {
    data: {},
    accept() {},
    acceptExports() {},
    dispose() {},
    prune() {},
    invalidate() {},
    on() {},
    off() {},
    send() {}
  };
}
export function injectQuery(url, queryToInject) {
  if (!url || (url[0] !== '.' && url[0] !== '/')) return url;
  const pathname = url.replace(/[?#].*$/, '');
  const parsed = new URL(url, 'http://vite.dev');
  return \`\${pathname}?\${queryToInject}\${parsed.search ? '&' + parsed.search.slice(1) : ''}\${parsed.hash || ''}\`;
}
export class ErrorOverlay extends HTMLElement {}
`);
    });
    let viteMiddleware: express.RequestHandler | null = null;
    let viteInitError: unknown = null;
    const viteReady = (async () => {
      try {
        const { createServer: createViteServer } = await import('vite');
        const vite = await createViteServer({
          optimizeDeps: {
            entries: ['index.html', 'admin.html']
          },
          server: {
            middlewareMode: true,
            hmr: false,
            ws: false,
            watch: process.env.DISABLE_HMR === 'true' ? null : {
              ignored: ['**/contracts/**', '**/blockchain/**', '**/.anagu-data/**', '**/supabase/**']
            }
          },
          appType: 'spa'
        });
        viteServer = vite;
        viteMiddleware = vite.middlewares;
      } catch (err) {
        viteInitError = err;
        console.error('[anagu/server] Vite dev middleware initialization error:', err);
      }
    })();

    app.use((req, res, next) => {
      if (viteMiddleware) {
        return viteMiddleware(req, res, next);
      }
      viteReady
        .then(() => {
          if (viteMiddleware) {
            viteMiddleware(req, res, next);
          } else {
            next(viteInitError || new Error('Vite dev server did not initialize.'));
          }
        })
        .catch(next);
    });
  } else {
    const distDir = path.join(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get(['/admin', '/admin/', '/admin/*'], (_req, res) => {
      return res.sendFile(path.join(distDir, 'admin.html'));
    });
    app.get('*', (req, res) => {
      if (req.path.startsWith('/api/')) {
        return res.status(404).json({ error: 'API route not found.' });
      }
      if (isAdminHost(req.hostname)) {
        return res.sendFile(path.join(distDir, 'admin.html'));
      }
      return res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  const cliPort = Number(getCliArg('--port'));
  const port = Number.isFinite(cliPort) && cliPort > 0 ? cliPort : Number(process.env.PORT) || 3000;
  const host = getCliArg('--host') || '0.0.0.0';

  const httpServer = app.listen(port, host, () => {
    console.log(`Anagu Land Administration server listening on http://${host}:${port}`);
  });

  httpServer.on('error', (err) => {
    console.error('[anagu/server] HTTP server error:', err);
  });

  let shuttingDown = false;
  const shutdown = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`[anagu/server] Received ${signal}, shutting down cleanly...`);
    const forceTimer = setTimeout(() => process.exit(0), 1500);
    forceTimer.unref();
    try {
      httpServer.close(() => {
        // closed
      });
      if (typeof httpServer.closeAllConnections === 'function') {
        httpServer.closeAllConnections();
      }
      if (viteServer) {
        await Promise.race([
          viteServer.close(),
          new Promise<void>((resolve) => setTimeout(resolve, 1000))
        ]);
      }
    } catch {
      // Ignore close errors during shutdown
    }
    process.exit(0);
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('unhandledRejection', (reason) => {
    console.error('[anagu/server] Unhandled promise rejection:', reason);
  });
}

startServer().catch((err) => {
  console.error('Failed to start Anagu server:', err);
  process.exit(1);
});
