"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { Cloud, CloudAlert, CloudOff, RefreshCw } from "lucide-react";
import { useSyncExternalStore } from "react";
import { db } from "@/lib/db/db";
import { syncEnabled } from "@/lib/sync/client";
import { requestSync, syncStatusStore } from "@/lib/sync/controller";
import { plural } from "@/lib/dates";
import { cn } from "@/lib/utils";

export function useSyncStatus() {
  const status = useSyncExternalStore(syncStatusStore.subscribe, syncStatusStore.get, syncStatusStore.get);
  const pending = useLiveQuery(() => db._outbox.count(), [], 0);
  return { ...status, pending };
}

export function syncLabel(s: ReturnType<typeof useSyncStatus>): string {
  const wait = s.pending > 0 ? `${s.pending} ${plural(s.pending, ["изменение ждёт", "изменения ждут", "изменений ждут"])} отправки` : "";
  if (s.state === "offline") return `Нет сети${wait ? ` — ${wait}` : ""}`;
  if (s.state === "error") return `Ошибка синхронизации${wait ? ` — ${wait}` : ""}`;
  if (s.state === "syncing") return "Синхронизация…";
  if (s.pending > 0) return wait;
  return "Всё синхронизировано";
}

/** Маленький индикатор: облако — синхронизировано, крутится — идёт, перечёркнуто — нет сети */
export function SyncIndicator({ withLabel, className }: { withLabel?: boolean; className?: string }) {
  const s = useSyncStatus();
  if (!syncEnabled) return null;
  const Icon = s.state === "offline" ? CloudOff : s.state === "error" ? CloudAlert : s.state === "syncing" ? RefreshCw : Cloud;
  const label = syncLabel(s);
  return (
    <button
      type="button"
      onClick={() => requestSync()}
      title={`${label}. Нажми, чтобы синхронизировать`}
      aria-label={label}
      className={cn(
        "inline-flex items-center gap-2 rounded-lg px-2 py-1 text-xs text-muted-foreground hover:bg-muted",
        s.state === "error" && "text-destructive",
        s.state === "offline" && "text-warning",
        className,
      )}
    >
      <Icon className={cn("size-4", s.state === "syncing" && "animate-spin")} />
      {withLabel && <span className="truncate">{label}</span>}
      {!withLabel && s.pending > 0 && s.state !== "syncing" && <span className="tabular-nums">{s.pending}</span>}
    </button>
  );
}
