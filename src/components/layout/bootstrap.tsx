"use client";

import { useEffect } from "react";
import { toast } from "sonner";
import { db } from "@/lib/db/db";
import { migrateLegacy } from "@/lib/db/legacy";
import { ensureSeeded } from "@/lib/db/seed";
import { processRecurring } from "@/lib/services/recurring";
import { plural, todayISO } from "@/lib/dates";
import { syncEnabled } from "@/lib/sync/client";

/**
 * При старте: перенос данных из старой локальной базы, service worker.
 * В локальном режиме ещё стартовые категории и регулярные платежи;
 * с синхронизацией это делает контроллер после первого pull (иначе можно затереть данные аккаунта).
 */
export function Bootstrap() {
  useEffect(() => {
    (async () => {
      try {
        if (await migrateLegacy(db)) toast.success("Данные перенесены в новую версию приложения");
        if (!syncEnabled) {
          await ensureSeeded();
          const n = await processRecurring(todayISO());
          if (n > 0) toast.success(`Записано ${n} ${plural(n, ["регулярный платёж", "регулярных платежа", "регулярных платежей"])}`);
        }
      } catch (e) {
        console.error(e);
        toast.error("Не удалось открыть базу данных. Возможно, браузер в приватном режиме.");
      }
    })();

    if ("serviceWorker" in navigator && process.env.NODE_ENV === "production") {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
  }, []);
  return null;
}
