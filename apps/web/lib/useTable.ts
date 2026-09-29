'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import type { Ack, ChatMessage, ClientEvent, ClientPayload, TableView } from '@poker/shared';
import { playSound } from './sounds';
import { clientSeed } from './seed';

export interface Reaction {
  id: number;
  userId: string;
  username: string;
  seat: number | null;
  emoji: string;
}

export type Emit = <E extends ClientEvent>(event: E, data: ClientPayload<E>) => Promise<Ack>;

/** Connects to the game server and keeps the latest table view, chat and reactions. */
export function useTable(code: string) {
  const [view, setView] = useState<TableView | null>(null);
  const [chat, setChat] = useState<ChatMessage[]>([]);
  const [reactions, setReactions] = useState<Reaction[]>([]);
  const [connected, setConnected] = useState(false);
  const [fatal, setFatal] = useState<string | null>(null);
  const [skew, setSkew] = useState(0);
  const socketRef = useRef<Socket | null>(null);
  const meRef = useRef<string | null>(null);

  useEffect(() => {
    const s = io({ transports: ['websocket', 'polling'], withCredentials: true });
    socketRef.current = s;
    let reactionId = 0;

    s.on('connect', () => {
      setConnected(true);
      s.emit('room:join', { code }, (ack: Ack) => {
        if (!ack.ok) setFatal(ack.error);
      });
    });
    s.on('disconnect', () => setConnected(false));
    s.on('connect_error', (err) => {
      if (err.message === 'unauthorized') setFatal('Please log in again');
    });
    s.on('table:state', (v: TableView) => {
      meRef.current = v.me.userId;
      setSkew(v.serverNow - Date.now());
      setView(v);
    });
    s.on('chat:history', (m: ChatMessage[]) => setChat(m));
    s.on('chat:message', (m: ChatMessage) => setChat((c) => [...c.slice(-99), m]));
    s.on('chat:reaction', (r: Omit<Reaction, 'id'>) => {
      const id = ++reactionId;
      setReactions((list) => [...list, { ...r, id }]);
      setTimeout(() => setReactions((list) => list.filter((x) => x.id !== id)), 2600);
    });
    s.on('table:event', (e: { kind: string; seat?: number }) => playSound(e.kind));
    s.on('fair:commit', (c: { handNo: number }) => {
      s.emit('player:seed', { handNo: c.handNo, seed: clientSeed() });
    });
    s.on('room:kicked', (r: { reason: string }) => {
      setFatal(r.reason);
      s.close();
    });
    return () => {
      s.close();
      socketRef.current = null;
    };
  }, [code]);

  const emit = useCallback<Emit>((event, data) => {
    const s = socketRef.current;
    if (!s || !s.connected) return Promise.resolve({ ok: false, error: 'Not connected' });
    return new Promise((resolve) => {
      const t = setTimeout(() => resolve({ ok: false, error: 'Timed out' }), 8000);
      s.emit(event, data, (ack: Ack) => {
        clearTimeout(t);
        resolve(ack);
      });
    });
  }, []);

  return { view, chat, reactions, connected, fatal, emit, skew };
}
