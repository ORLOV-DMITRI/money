"use client";

import * as React from "react";
import { formatMoney, parseAmount, tiynToInput } from "@/lib/money";
import { cn } from "@/lib/utils";
import { inputClass } from "./input";

/**
 * Поле суммы: принимает «12 500», «1200+850», «2x650».
 * value/onChange — в тиынах (null, если ввод пока некорректен).
 */
export function AmountInput({
  value,
  onChange,
  className,
  size = "default",
  autoFocus,
  placeholder = "0",
  id,
  ariaLabel,
}: {
  value: number | null;
  onChange: (v: number | null) => void;
  className?: string;
  size?: "default" | "lg";
  autoFocus?: boolean;
  placeholder?: string;
  id?: string;
  ariaLabel?: string;
}) {
  const [text, setText] = React.useState(() => (value ? tiynToInput(value) : ""));
  const lastEmitted = React.useRef<number | null>(value);

  // Синхронизация, если значение поменяли снаружи (например, выбрали шаблон)
  React.useEffect(() => {
    if (value !== lastEmitted.current) {
      lastEmitted.current = value;
      setText(value ? tiynToInput(value) : "");
    }
  }, [value]);

  const isExpr = /[+\-*/xх×()]/i.test(text.replace(/^\s*[+-]/, ""));
  const parsed = parseAmount(text);

  return (
    <div className={cn("relative", className)}>
      <input
        id={id}
        aria-label={ariaLabel}
        inputMode="decimal"
        autoComplete="off"
        autoFocus={autoFocus}
        placeholder={placeholder}
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          const v = parseAmount(e.target.value);
          lastEmitted.current = v;
          onChange(v);
        }}
        onBlur={() => {
          if (isExpr && parsed) setText(tiynToInput(parsed));
        }}
        className={cn(inputClass, "pr-8 tabular-nums", size === "lg" && "h-14 rounded-2xl text-3xl font-semibold sm:text-3xl")}
      />
      <span className={cn("pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground", size === "lg" && "text-2xl")}>₸</span>
      {isExpr && parsed != null && <p className="mt-1 text-xs text-muted-foreground">= {formatMoney(parsed)}</p>}
    </div>
  );
}
