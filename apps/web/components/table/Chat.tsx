'use client';
import { useEffect, useRef, useState } from 'react';
import { type ChatMessage, REACTIONS } from '@poker/shared';
import type { Emit } from '@/lib/useTable';

export function Chat({ chat, emit, meId }: { chat: ChatMessage[]; emit: Emit; meId: string }) {
  const [text, setText] = useState('');
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => endRef.current?.scrollIntoView({ block: 'end' }), [chat.length]);

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 space-y-1 overflow-y-auto p-2 text-sm">
        {chat.map((m) => (
          <div key={m.id} className={m.system ? 'text-xs italic text-white/50' : ''}>
            {!m.system && <span className={`font-semibold ${m.userId === meId ? 'text-sky-300' : 'text-emerald-300'}`}>{m.username}: </span>}
            <span className="break-words">{m.text}</span>
          </div>
        ))}
        <div ref={endRef} />
      </div>
      <div className="flex flex-wrap gap-1 border-t border-white/10 p-2">
        {REACTIONS.map((e) => (
          <button key={e} className="rounded-md px-1 text-xl hover:bg-white/10" onClick={() => emit('chat:react', { emoji: e })}>
            {e}
          </button>
        ))}
      </div>
      <form
        className="flex gap-2 p-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (!text.trim()) return;
          emit('chat:send', { text });
          setText('');
        }}
      >
        <input className="input py-1.5 text-sm" value={text} maxLength={200} placeholder="Say something…" onChange={(e) => setText(e.target.value)} />
        <button className="btn-primary px-3 py-1.5 text-sm">Send</button>
      </form>
    </div>
  );
}
