"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { DialogContent } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/input";
import { AmountInput } from "@/components/ui/amount-input";
import { ColorPicker, EmojiPicker } from "@/components/ui/pickers";
import { db } from "@/lib/db/db";
import type { Goal } from "@/lib/db/schema";

export function GoalDialog({ goal, onDone }: { goal?: Goal; onDone: (id?: string) => void }) {
  const [name, setName] = useState(goal?.name ?? "");
  const [icon, setIcon] = useState(goal?.icon ?? "🎯");
  const [color, setColor] = useState(goal?.color ?? "#0ea5e9");
  const [target, setTarget] = useState<number | null>(goal?.target ?? null);
  const [deadline, setDeadline] = useState(goal?.deadline ?? "");
  const [autoPercent, setAutoPercent] = useState(goal?.autoPercent ?? 0);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return toast.error("Как назовём копилку?");
    if (!target) return toast.error("Укажи цель — сколько хочешь накопить");
    const data = { name: name.trim(), icon, color, target, deadline: deadline || undefined, autoPercent: Math.max(0, Math.min(100, Math.round(autoPercent))) };
    if (goal) {
      await db.goals.update(goal.id, data);
      toast.success("Копилка обновлена");
      onDone(goal.id);
    } else {
      const id = await db.goals.add({ ...data, archived: false, createdAt: Date.now() });
      toast.success("Копилка создана 🐷");
      onDone(id);
    }
  };

  return (
    <DialogContent title={goal ? "Изменить копилку" : "Новая копилка"}>
      <form onSubmit={save} className="grid gap-4">
        <Field label="Название">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Отпуск, ноутбук, подушка…" autoFocus={!goal} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Цель">
            <AmountInput value={target} onChange={setTarget} ariaLabel="Целевая сумма" />
          </Field>
          <Field label="Срок (необязательно)">
            <Input type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} />
          </Field>
        </div>
        <Field label={`Автоотчисление с каждого прихода: ${autoPercent}%`} hint="Часть каждого прихода будет сама уходить в эту копилку">
          <input type="range" min={0} max={50} step={1} value={autoPercent} onChange={(e) => setAutoPercent(Number(e.target.value))} className="w-full accent-[var(--primary)]" aria-label="Процент автоотчисления" />
        </Field>
        <Field label="Иконка">
          <EmojiPicker value={icon} onChange={setIcon} />
        </Field>
        <Field label="Цвет">
          <ColorPicker value={color} onChange={setColor} />
        </Field>
        <Button type="submit" size="lg">
          {goal ? "Сохранить" : "Создать копилку"}
        </Button>
      </form>
    </DialogContent>
  );
}
