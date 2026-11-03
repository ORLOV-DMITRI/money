import { formatMoney } from "@/lib/money";
import { cn } from "@/lib/utils";

/** Сумма с правильными знаками и цветом. kind задаёт смысл: приход зелёный, расход обычный. */
export function Money({
  value,
  kind,
  className,
  sign,
}: {
  value: number;
  kind?: "income" | "expense" | "neutral" | "auto";
  className?: string;
  sign?: boolean;
}) {
  let shown = value;
  let color = "";
  if (kind === "income") {
    color = "text-income";
    shown = Math.abs(value);
  } else if (kind === "expense") {
    shown = -Math.abs(value);
  } else if (kind === "auto") {
    color = value > 0 ? "text-income" : value < 0 ? "text-destructive" : "";
  }
  return (
    <span className={cn("tabular-nums whitespace-nowrap", color, className)}>
      {formatMoney(shown, { sign: sign ?? (kind === "income" || kind === "auto") })}
    </span>
  );
}
