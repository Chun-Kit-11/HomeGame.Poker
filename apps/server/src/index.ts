import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import next from 'next';
import { Server } from 'socket.io';
import { tokenFromCookieHeader, userFromToken } from './auth/sessions';
import { realClock } from './clock';
import { db } from './db';
import { env } from './env';
import { createApiApp } from './http/app';
import { handsRouter } from './http/hands';
import { roomsRouter } from './http/rooms';
import { sessionsRouter } from './http/sessions';
import { PrismaPersistence } from './persistence';
import { FairDealer } from './rooms/dealer';
import { RoomManager } from './rooms/RoomManager';
import { attachGateway, roomChannel, socketTransport } from './sockets/gateway';

const here = path.dirname(fileURLToPath(import.meta.url));
const webDir = path.resolve(here, '../../web');

async function main() {
  const nextApp = next({ dev: !env.isProd, dir: webDir });
  const handle = nextApp.getRequestHandler();
  await nextApp.prepare();

  let io: Server;
  const manager = new RoomManager({
    persistence: new PrismaPersistence(),
    clock: realClock,
    dealer: (code) => new FairDealer(code, (event, payload) => io.to(roomChannel(code)).emit(event, payload), realClock),
    transport: (code) => socketTransport(io, code),
    loadRoom: (code) => db().room.findUnique({ where: { code }, select: { id: true, code: true, hostId: true, config: true, status: true, snapshot: true } }),
  });

  const app = createApiApp((api) => {
    api.use('/rooms', roomsRouter(manager));
    api.use('/hands', handsRouter());
    api.use('/sessions', sessionsRouter());
  });
  app.all('/{*path}', (req, res) => handle(req, res));

  const server = createServer(app);
  io = new Server(server, { serveClient: false, maxHttpBufferSize: 16_384 });
  attachGateway(io, manager, (cookie) => userFromToken(tokenFromCookieHeader(cookie)));

  // Housekeeping: unload idle rooms (their state is in the database) and purge expired logins.
  const housekeeping = setInterval(() => {
    manager.sweep();
    db()
      .session.deleteMany({ where: { expiresAt: { lt: new Date() } } })
      .catch((err) => console.error('[housekeeping]', err));
  }, 10 * 60_000);
  housekeeping.unref();

  server.listen(env.port, env.host, () => {
    console.log(`Poker server ready on http://localhost:${env.port}`);
  });

  const shutdown = async () => {
    console.log('Shutting down…');
    manager.disposeAll();
    await manager.flushAll();
    io.close();
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 5000).unref();
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
