import express, { type Express, type Request, type Response, type NextFunction } from 'express';
import { authRouter, loadUser } from '../auth/routes';
import { env } from '../env';

/**
 * Builds the Express app that serves the JSON API under /api.
 * Everything else is forwarded to Next.js (see index.ts).
 */
export function createApiApp(extra?: (api: express.Router) => void): Express {
  const app = express();
  app.set('trust proxy', 1); // Render sits behind one proxy hop
  app.disable('x-powered-by');
  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'same-origin');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    if (env.cookieSecure) res.setHeader('Strict-Transport-Security', 'max-age=31536000');
    next();
  });

  const api = express.Router();
  api.use(express.json({ limit: '64kb' }));
  api.use(loadUser);
  api.use('/auth', authRouter());
  extra?.(api);
  api.use((_req, res) => {
    res.status(404).json({ error: 'Not found' });
  });
  api.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    console.error('[api] error', err);
    res.status(500).json({ error: 'Server error' });
  });

  app.use('/api', api);
  app.get('/healthz', (_req, res) => {
    res.json({ ok: true });
  });
  return app;
}
