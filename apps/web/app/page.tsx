'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { fetchMe } from '@/lib/api';

export default function Home() {
  const router = useRouter();
  useEffect(() => {
    fetchMe()
      .then((me) => router.replace(me ? '/lobby' : '/login'))
      .catch(() => router.replace('/login'));
  }, [router]);
  return <main className="grid min-h-dvh place-items-center text-white/50">Loading…</main>;
}
