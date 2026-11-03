"use client";

import { Check } from "lucide-react";
import { EMOJIS, PALETTE, cn } from "@/lib/utils";

export function EmojiPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="grid grid-cols-8 gap-1">
      {EMOJIS.map((e) => (
        <button
          key={e}
          type="button"
          onClick={() => onChange(e)}
          aria-label={`Иконка ${e}`}
          aria-pressed={value === e}
          className={cn("flex aspect-square items-center justify-center rounded-lg text-xl transition-colors hover:bg-muted", value === e && "bg-primary-soft ring-2 ring-primary")}
        >
          {e}
        </button>
      ))}
    </div>
  );
}

export function ColorPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {PALETTE.map((c) => (
        <button
          key={c}
          type="button"
          onClick={() => onChange(c)}
          aria-label={`Цвет ${c}`}
          aria-pressed={value === c}
          className="flex size-8 items-center justify-center rounded-full ring-offset-2 ring-offset-card transition-transform hover:scale-110"
          style={{ background: c, boxShadow: value === c ? `0 0 0 2px var(--card), 0 0 0 4px ${c}` : undefined }}
        >
          {value === c && <Check className="size-4 text-white" />}
        </button>
      ))}
    </div>
  );
}
