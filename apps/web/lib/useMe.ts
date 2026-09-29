'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { fetchMe, type Me } from './api';

/** Loads the current user; redirects to /login (preserving the return path) if required. */
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
          const next = window.location.pathname + window.location.search;
          router.replace(`/login?next=${encodeURIComponent(next)}`);
        }
      })
      .catch(() => alive && setMe(null));
    return () => {
      alive = false;
    };
  }, [required, router]);
  return me;
}
