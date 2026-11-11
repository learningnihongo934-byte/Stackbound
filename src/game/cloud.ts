// Optional cloud save through Rennko Cloud (Google sign-in). The game works fully offline without it.
import { P, replaceProfile, setPushHook, type Profile } from './profile';

const PROJECT = 'https://stackbound-save.rennko.tech';
const SDK = 'https://console.rennko.tech/rennko.js';

type User = { uid: string; email?: string; displayName?: string; anon?: boolean } | null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let app: any = null;
let user: User = null;
let status: 'off' | 'ready' | 'syncing' | 'synced' | 'error' = 'off';
let lastErr = '';
const subs = new Set<() => void>();
export const cloudState = () => ({ user, status, lastErr });
export const onCloud = (fn: () => void) => { subs.add(fn); return () => subs.delete(fn); };
const emit = () => subs.forEach(f => f());

export async function cloudInit() {
  try {
    const mod = await import(/* @vite-ignore */ SDK);
    app = mod.initApp(PROJECT);
    status = 'ready';
    app.auth.onAuthChange(async (u: User) => {
      user = u && !u.anon ? u : null;
      emit();
      if (user) await pullAndMerge();
    });
    let t: number | null = null;
    setPushHook(p => {
      if (!user) return;
      if (t) clearTimeout(t);
      t = window.setTimeout(() => push(p), 1500);
    });
  } catch (e) {
    status = 'error';
    lastErr = 'Cloud save is unavailable right now.';
  }
  emit();
}

export async function signIn() {
  if (!app) { lastErr = 'Cloud save is unavailable right now.'; emit(); throw new Error(lastErr); }
  await app.auth.signInWithGoogle();
}
export async function signOut() { if (app) await app.auth.signOut(); user = null; emit(); }

async function push(p: Profile) {
  if (!app || !user) return;
  try {
    status = 'syncing'; emit();
    await app.db.doc(`players/${user.uid}`).set({ profile: JSON.stringify(p), updatedAt: p.updatedAt, uid: user.uid });
    status = 'synced';
  } catch (e) { status = 'error'; lastErr = String((e as Error).message || e); }
  emit();
}

async function pullAndMerge() {
  if (!app || !user) return;
  try {
    status = 'syncing'; emit();
    const snap = await app.db.doc(`players/${user.uid}`).get();
    if (snap.exists) {
      const remote: Profile = JSON.parse(snap.data().profile);
      if (remote.updatedAt > P.updatedAt) {
        // keep the union of both collections so nothing is ever lost
        replaceProfile(mergeProfiles(remote, P));
      }
    }
    await push(P);
  } catch (e) { status = 'error'; lastErr = String((e as Error).message || e); emit(); }
}

/** Newer profile wins for settings/currency, but progress from both sides is kept. */
function mergeProfiles(newer: Profile, older: Profile): Profile {
  const out: Profile = JSON.parse(JSON.stringify(newer));
  for (const [id, n] of Object.entries(older.coll)) out.coll[id] = Math.max(out.coll[id] || 0, n);
  for (const [id, n] of Object.entries(older.foil)) out.foil[id] = Math.max(out.foil[id] || 0, n);
  for (const [id, n] of Object.entries(older.cleared)) out.cleared[id] = Math.max(out.cleared[id] || 0, n);
  for (const d of older.decks) if (!out.decks.some(x => x.id === d.id)) out.decks.push(d);
  if (!out.starter) out.starter = older.starter;
  out.tutorial = out.tutorial || older.tutorial;
  for (const k of Object.keys(out.stats) as (keyof Profile['stats'])[]) out.stats[k] = Math.max(out.stats[k], older.stats[k] || 0);
  return out;
}
