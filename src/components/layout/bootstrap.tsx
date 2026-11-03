"use client";

import { useEffect } from "react";
import { toast } from "sonner";
import { ensureSeeded } from "@/lib/db/seed";
import { processRecurring } from "@/lib/services/recurring";
import { plural, todayISO } from "@/lib/dates";

/** При старте: стартовые данные, регулярные платежи, service worker */
export function Bootstrap() {
  useEffect(() => {
    (async () => {
      try {
        await ensureSeeded();
        const n = await processRecurring(todayISO());
        if (n > 0) toast.success(`Записано ${n} ${plural(n, ["регулярный платёж", "регулярных платежа", "регулярных платежей"])}`);
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
