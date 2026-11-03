"use client";

import type { Session } from "@supabase/supabase-js";
import { useEffect, useState, useSyncExternalStore } from "react";
import { getSupabase, syncEnabled } from "@/lib/sync/client";
import { startSync, stopSync, syncStatusStore } from "@/lib/sync/controller";
import { LoginScreen } from "./login-screen";

function Splash({ text }: { text: string }) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-3 text-muted-foreground">
      <span className="flex size-12 animate-pulse items-center justify-center rounded-2xl bg-primary text-2xl text-primary-foreground">₸</span>
      <p className="text-sm">{text}</p>
    </div>
  );
}

/**
 * Если Supabase настроен: без входа — экран входа; после входа — первая синхронизация, затем приложение.
 * Без настроек Supabase приложение работает локально, как раньше.
 */
export function AuthGate({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null | undefined>(syncEnabled ? undefined : null);
  const status = useSyncExternalStore(syncStatusStore.subscribe, syncStatusStore.get, syncStatusStore.get);

  useEffect(() => {
    const sb = getSupabase();
    if (!sb) return;
    sb.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = sb.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);

  const userId = session?.user.id;
  useEffect(() => {
    if (!userId) return;
    void startSync(userId);
    return () => stopSync();
  }, [userId]);

  if (!syncEnabled) return <>{children}</>;
  if (session === undefined) return <Splash text="Загрузка…" />;
  if (!session) return <LoginScreen />;
  if (!status.ready) return <Splash text="Синхронизирую данные…" />;
  return <>{children}</>;
}
