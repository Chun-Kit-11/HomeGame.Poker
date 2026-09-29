import express, { type Express, type Request, type Response, type NextFunction } from 'express';
import { authRouter, loadUser } from '../auth/routes';

/**
 * Builds the Express app that serves the JSON API under /api.
 * Everything else is forwarded to Next.js (see index.ts).
 */
export function createApiApp(extra?: (api: express.Router) => void): Express {
  const app = express();
  app.set('trust proxy', 1); // Render/Railway sit behind one proxy hop
  app.disable('x-powered-by');

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
