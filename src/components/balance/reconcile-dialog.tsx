"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { DialogContent } from "@/components/ui/dialog";
import { Field } from "@/components/ui/input";
import { AmountInput } from "@/components/ui/amount-input";
import { useBalances, useToday } from "@/hooks/use-data";
import { formatMoney } from "@/lib/money";
import { reconcileBalance } from "@/lib/services/transactions";
import { cn } from "@/lib/utils";

/** «Сверить баланс»: вводим реальную сумму, разница записывается корректировкой */
export function ReconcileDialog({ onDone }: { onDone: () => void }) {
  const balances = useBalances();
  const today = useToday();
  const [actual, setActual] = useState<number | null>(null);
  const current = balances?.totals.free ?? 0;
  const diff = actual != null ? actual - current : null;

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (actual == null) return toast.error("Введи сумму");
    const d = await reconcileBalance(actual, current, today);
    toast.success(d === 0 ? "Всё сходится 🎉" : `Баланс поправлен на ${formatMoney(d, { sign: true })}`);
    onDone();
  };

  return (
    <DialogContent title="Сверить баланс" description="Посчитай, сколько денег у вас сейчас на руках и на картах — без копилок" size="sm">
      <form onSubmit={save} className="grid gap-4">
        <p className="text-sm">
          По приложению свободно: <span className="font-semibold tabular-nums">{formatMoney(current)}</span>
        </p>
        <Field label="На самом деле">
          <AmountInput value={actual} onChange={setActual} size="lg" autoFocus ariaLabel="Реальная сумма" />
        </Field>
        {diff != null && (
          <p className={cn("rounded-xl p-3 text-sm", diff === 0 ? "bg-primary-soft" : "bg-muted")}>
            {diff === 0 ? (
              "Всё сходится — корректировка не нужна 🎉"
            ) : (
              <>
                Запишу корректировку <span className="font-semibold tabular-nums">{formatMoney(diff, { sign: true })}</span>. В отчёты о тратах она не попадёт.
                {diff < 0 && " Похоже, какие-то траты забыли записать 🙂"}
              </>
            )}
          </p>
        )}
        <Button type="submit" size="lg" disabled={actual == null}>
          {diff === 0 ? "Готово" : "Сверить"}
        </Button>
      </form>
    </DialogContent>
  );
}
