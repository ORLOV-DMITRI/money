"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Segmented } from "@/components/ui/misc";
import { containsToday, formatPeriod, getPeriod, shiftPeriod, type Period, type PeriodType } from "@/lib/dates";

const OPTIONS: { value: PeriodType; label: string }[] = [
  { value: "day", label: "День" },
  { value: "week", label: "Неделя" },
  { value: "month", label: "Месяц" },
  { value: "year", label: "Год" },
  { value: "custom", label: "Период" },
];

export function PeriodPicker({ period, onChange, today }: { period: Period; onChange: (p: Period) => void; today: string }) {
  return (
    <div className="grid gap-3">
      <Segmented
        value={period.type}
        options={OPTIONS}
        onChange={(t) => {
          if (t === "custom") onChange({ type: "custom", start: getPeriod("month", today).start, end: today });
          else onChange(getPeriod(t, containsToday(period, today) ? today : period.start));
        }}
      />
      {period.type === "custom" ? (
        <div className="grid grid-cols-2 gap-2">
          <Input type="date" aria-label="С" value={period.start} max={period.end} onChange={(e) => e.target.value && onChange({ ...period, start: e.target.value })} />
          <Input type="date" aria-label="По" value={period.end} min={period.start} onChange={(e) => e.target.value && onChange({ ...period, end: e.target.value })} />
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" aria-label="Предыдущий период" onClick={() => onChange(shiftPeriod(period, -1))}>
            <ChevronLeft />
          </Button>
          <p className="flex-1 text-center font-semibold">{formatPeriod(period)}</p>
          {!containsToday(period, today) && (
            <Button variant="ghost" size="sm" onClick={() => onChange(getPeriod(period.type as Exclude<PeriodType, "custom">, today))}>
              Сейчас
            </Button>
          )}
          <Button variant="outline" size="icon" aria-label="Следующий период" onClick={() => onChange(shiftPeriod(period, 1))}>
            <ChevronRight />
          </Button>
        </div>
      )}
    </div>
  );
}
