import type { Server, Socket } from 'socket.io';
import { type ClientEvent, clientMessages, REACTIONS } from '@poker/shared';
import type { AuthUser } from '../auth/sessions';
import { RateLimiter } from '../ratelimit';
import { type Room, RoomError, type Transport } from '../rooms/Room';
import type { RoomManager } from '../rooms/RoomManager';

export const roomChannel = (code: string) => `r:${code}`;
export const userChannel = (code: string, userId: string) => `r:${code}:u:${userId}`;

export function socketTransport(io: Server, code: string): Transport {
  return {
    toUser: (userId, event, payload) => {
      io.to(userChannel(code, userId)).emit(event, payload);
    },
    toAll: (event, payload) => {
      io.to(roomChannel(code)).emit(event, payload);
    },
    evict: (userId) => {
      io.in(userChannel(code, userId)).socketsLeave([roomChannel(code), userChannel(code, userId)]);
    },
  };
}


type Handler = (room: Room, user: AuthUser, data: any, socket: Socket) => void | Promise<void>;

/**
 * Wires Socket.IO to rooms. Every message is authenticated (session cookie on
 * connect), rate-limited, validated with zod, and acknowledged with
 * { ok: true } or { ok: false, error }.
 */
export function attachGateway(
  io: Server,
  manager: RoomManager,
  resolveUser: (cookie: string | undefined) => Promise<AuthUser | null>,
  limits: { actions?: RateLimiter; chat?: RateLimiter } = {},
) {
  // Per-user limits (shared across a user's tabs)
  const actionLimiter = limits.actions ?? new RateLimiter(20, 8);
  const chatLimiter = limits.chat ?? new RateLimiter(5, 0.5);

  io.use(async (socket, next) => {
    try {
      const user = await resolveUser(socket.handshake.headers.cookie);
      if (!user) return next(new Error('unauthorized'));
      socket.data.user = user;
      next();
    } catch (err) {
      next(err as Error);
    }
  });

  io.on('connection', (socket) => {
    const user = socket.data.user as AuthUser;
    let room: Room | null = null;

    const leaveCurrent = () => {
      if (!room) return;
      socket.leave(roomChannel(room.code));
      socket.leave(userChannel(room.code, user.id));
      room.disconnect(user.id);
      room = null;
    };

    const on = (event: ClientEvent, handler: Handler, limiter = actionLimiter) => {
      socket.on(event, async (raw: unknown, ack?: (r: unknown) => void) => {
        const reply = typeof ack === 'function' ? ack : () => undefined;
        if (!limiter.take(user.id)) return reply({ ok: false, error: 'Slow down' });
        const parsed = clientMessages[event].safeParse(raw ?? {});
        if (!parsed.success) return reply({ ok: false, error: 'Invalid request' });
        try {
          if (event === 'room:join') {
            await joinRoom(parsed.data as { code: string });
            return reply({ ok: true });
          }
          if (!room || !room.isMember(user.id)) return reply({ ok: false, error: 'Join a room first' });
          await handler(room, user, parsed.data, socket);
          reply({ ok: true });
        } catch (err) {
          if (err instanceof RoomError) return reply({ ok: false, error: err.message });
          console.error(`[socket] ${event} failed`, err);
          reply({ ok: false, error: 'Server error' });
        }
      });
    };

    async function joinRoom({ code }: { code: string }) {
      const target = await manager.get(code);
      if (!target) throw new RoomError('Room not found or already ended');
      if (room === target) {
        target.broadcastNow();
        return;
      }
      leaveCurrent();
      socket.join([roomChannel(target.code), userChannel(target.code, user.id)]);
      try {
        target.join(user.id, user.username);
      } catch (err) {
        socket.leave(roomChannel(target.code));
        socket.leave(userChannel(target.code, user.id));
        throw err;
      }
      room = target;
    }

    on('room:join', () => undefined);
    on('room:leave', () => leaveCurrent());
    on('seat:request', (r, u, d) => r.requestSeat(u.id, d.seat, d.amount, d.entry));
    on('seat:cancel', (r, u) => r.cancelRequest(u.id));
    on('player:action', (r, u, d) => r.act(u.id, d.handNo, d.action));
    on('player:sitOut', (r, u) => r.sitOut(u.id));
    on('player:sitIn', (r, u, d) => r.sitIn(u.id, d.entry));
    on('player:leave', (r, u) => r.leaveSeat(u.id));
    on('player:rebuy', (r, u, d) => r.requestRebuy(u.id, d.amount));
    on('player:addOn', (r, u) => r.requestAddOn(u.id));
    on('player:seed', (r, u, d) => r.submitSeed(u.id, d.handNo, d.seed));
    on('host:start', (r, u) => r.start(u.id));
    on('host:pause', (r, u) => r.pause(u.id));
    on('host:resume', (r, u) => r.resume(u.id));
    on('host:kick', (r, u, d) => r.kick(u.id, d.userId));
    on('host:approve', (r, u, d) => r.approve(u.id, d.requestId));
    on('host:deny', (r, u, d) => r.deny(u.id, d.requestId));
    on('host:setBlinds', (r, u, d) => r.setBlinds(u.id, d.smallBlind, d.bigBlind));
    on('host:setAutoApprove', (r, u, d) => r.setAutoApprove(u.id, d.autoApprove));
    on('host:end', (r, u) => r.end(u.id));
    on('chat:send', (r, u, d) => r.sendChat(u.id, d.text), chatLimiter);
    on(
      'chat:react',
      (r, u, d) => {
        if (!(REACTIONS as readonly string[]).includes(d.emoji)) throw new RoomError('Unknown reaction');
        r.react(u.id, d.emoji);
      },
      chatLimiter,
    );

    socket.on('disconnect', () => leaveCurrent());
  });
}
