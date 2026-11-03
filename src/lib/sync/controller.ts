"use client";

import { liveQuery, type Subscription } from "dexie";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { db } from "@/lib/db/db";
import { ensureSeeded } from "@/lib/db/seed";
import { processRecurring } from "@/lib/services/recurring";
import { todayISO } from "@/lib/dates";
import { getSupabase } from "./client";
import { SyncEngine } from "./engine";
import { SupabaseRemote } from "./remote";

export type SyncState = "idle" | "syncing" | "offline" | "error";

export interface SyncStatus {
  state: SyncState;
  lastSyncedAt: number | null;
  error: string | null;
  /** первая синхронизация после входа завершена (или пропущена из-за офлайна) */
  ready: boolean;
}

let status: SyncStatus = { state: "idle", lastSyncedAt: null, error: null, ready: false };
const listeners = new Set<() => void>();

function setStatus(patch: Partial<SyncStatus>) {
  status = { ...status, ...patch };
  listeners.forEach((l) => l());
}

export const syncStatusStore = {
  subscribe(l: () => void) {
    listeners.add(l);
    return () => listeners.delete(l);
  },
  get: () => status,
};

let engine: SyncEngine | null = null;
let running: Promise<void> | null = null;
let again = false;
let debounce: ReturnType<typeof setTimeout> | null = null;
const cleanups: (() => void)[] = [];

/** Запустить синхронизацию сейчас (или сразу после текущей) */
export function requestSync(delay = 0) {
  if (!engine) return;
  if (debounce) clearTimeout(debounce);
  debounce = setTimeout(() => {
    debounce = null;
    void runSync();
  }, delay);
}

async function runSync(): Promise<void> {
  if (!engine) return;
  if (running) {
    again = true;
    return running;
  }
  running = (async () => {
    do {
      again = false;
      if (typeof navigator !== "undefined" && !navigator.onLine) {
        setStatus({ state: "offline" });
        return;
      }
      setStatus({ state: "syncing", error: null });
      try {
        await engine!.sync();
        setStatus({ state: "idle", lastSyncedAt: Date.now() });
      } catch (e) {
        console.error("sync failed", e);
        setStatus({ state: navigator.onLine ? "error" : "offline", error: (e as Error).message });
      }
    } while (again && engine);
  })().finally(() => {
    running = null;
  });
  return running;
}

/**
 * Старт после входа: первый pull → стартовые категории, если аккаунт пустой → push →
 * регулярные платежи. Дальше синхронизация по событиям: локальные изменения, realtime,
 * возврат сети, возврат на вкладку и раз в минуту.
 */
export async function startSync(userId: string) {
  const sb = getSupabase();
  if (!sb || engine) return;
  engine = new SyncEngine(db, new SupabaseRemote(sb, userId), userId);

  const owner = (await db.settings.get("sync:user"))?.value;
  if (owner && owner !== userId) {
    // в браузере остались данные другого аккаунта — не смешиваем
    await db.transaction("rw", db.tables, async () => {
      for (const t of db.tables) await t.clear();
    });
  }
  await db.settings.put({ key: "sync:user", value: userId });

  try {
    if (navigator.onLine) {
      setStatus({ state: "syncing" });
      await engine.pull();
    }
    await ensureSeeded();
    await processRecurring(todayISO());
    await runSync();
  } catch (e) {
    setStatus({ state: "error", error: (e as Error).message });
  } finally {
    setStatus({ ready: true });
  }

  // локальные изменения → отправить через секунду (пачкой)
  const sub: Subscription = liveQuery(() => db._outbox.count()).subscribe((n) => n > 0 && requestSync(1000));
  cleanups.push(() => sub.unsubscribe());

  const channel: RealtimeChannel = sb
    .channel("money-sync")
    .on("postgres_changes", { event: "*", schema: "public", filter: `user_id=eq.${userId}` }, () => requestSync(500))
    .subscribe();
  cleanups.push(() => void sb.removeChannel(channel));

  const onOnline = () => requestSync();
  const onOffline = () => setStatus({ state: "offline" });
  const onVisible = () => document.visibilityState === "visible" && requestSync();
  window.addEventListener("online", onOnline);
  window.addEventListener("offline", onOffline);
  document.addEventListener("visibilitychange", onVisible);
  const timer = setInterval(() => requestSync(), 60_000);
  cleanups.push(() => {
    window.removeEventListener("online", onOnline);
    window.removeEventListener("offline", onOffline);
    document.removeEventListener("visibilitychange", onVisible);
    clearInterval(timer);
  });
}

export function stopSync() {
  cleanups.splice(0).forEach((c) => c());
  engine = null;
  setStatus({ state: "idle", lastSyncedAt: null, error: null, ready: false });
}

/** Выход: отправить что успеем, выйти и стереть локальные данные этого аккаунта */
export async function signOutAndWipe() {
  try {
    await runSync();
  } catch {}
  stopSync();
  await getSupabase()?.auth.signOut();
  await db.delete();
  window.location.reload();
}
