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
      <div className="flex-1 space-y-1.5 overflow-y-auto p-3 text-sm">
        {chat.map((m) => (
          m.system ? (
            <div key={m.id} className="py-0.5 text-center text-[11px] text-white/40">
              {m.text}
            </div>
          ) : (
            <div key={m.id} className={`flex ${m.userId === meId ? 'justify-end' : ''}`}>
              <div className={`max-w-[85%] rounded-2xl px-3 py-1.5 ${m.userId === meId ? 'rounded-br-md bg-gold/15 ring-1 ring-inset ring-gold/20' : 'rounded-bl-md bg-white/[0.06]'}`}>
                {m.userId !== meId && <div className="text-[11px] font-semibold text-emerald-300">{m.username}</div>}
                <div className="break-words">{m.text}</div>
              </div>
            </div>
          )
        ))}
        <div ref={endRef} />
      </div>
      <div className="flex gap-1 overflow-x-auto border-t border-white/[0.06] px-2 py-1.5">
        {REACTIONS.map((e) => (
          <button key={e} className="shrink-0 rounded-lg px-1.5 py-0.5 text-xl transition hover:scale-110 hover:bg-white/10" onClick={() => emit('chat:react', { emoji: e })}>
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
        <input className="input h-10 text-sm" value={text} maxLength={200} placeholder="Message the table…" onChange={(e) => setText(e.target.value)} />
        <button className="btn-primary h-10 px-4">Send</button>
      </form>
    </div>
  );
}
