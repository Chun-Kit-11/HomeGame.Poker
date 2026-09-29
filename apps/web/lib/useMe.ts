'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { fetchMe, type Me } from './api';

/**
 * Loads the current player. If required and there is none yet, sends them to the
 * start page to pick a name (keeping the room code when they came from an invite link).
 */
export function useMe(required = true) {
  const [me, setMe] = useState<Me | null | undefined>(undefined);
  const router = useRouter();
  useEffect(() => {
    let alive = true;
    fetchMe()
      .then((u) => {
        if (!alive) return;
        setMe(u);
        if (!u && required) {
          const room = window.location.pathname.match(/^\/room\/([^/]+)/);
          router.replace(room ? `/?join=${encodeURIComponent(room[1])}` : '/');
        }
      })
      .catch(() => alive && setMe(null));
    return () => {
      alive = false;
    };
  }, [required, router]);
  return me;
}
