import { redirect } from 'next/navigation';

/** The lobby was merged into the start page; keep old links and installed apps working. */
export default function LobbyPage() {
  redirect('/');
}
