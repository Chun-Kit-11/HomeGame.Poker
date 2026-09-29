import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import next from 'next';
import { env } from './env';
import { createApiApp } from './http/app';

const here = path.dirname(fileURLToPath(import.meta.url));
const webDir = path.resolve(here, '../../web');

async function main() {
  const nextApp = next({ dev: !env.isProd, dir: webDir });
  const handle = nextApp.getRequestHandler();
  await nextApp.prepare();

  const app = createApiApp();
  app.all('/{*path}', (req, res) => handle(req, res));

  const server = createServer(app);
  server.listen(env.port, () => {
    console.log(`Poker server ready on http://localhost:${env.port}`);
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
