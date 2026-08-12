import { useState } from "react";
import { CalendarIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { format, startOfDay, endOfDay, subDays, startOfMonth, endOfMonth } from "date-fns";
import { ptBR } from "date-fns/locale";

export type UnifiedPeriod = "hoje" | "ontem" | "7dias" | "mes" | "total" | "personalizado";

interface Props {
  value: UnifiedPeriod;
  onChange: (value: UnifiedPeriod) => void;
  selectedMonths: string[];
  onMonthsChange: (months: string[]) => void;
  customRange?: { from: Date; to: Date };
  onCustomRangeChange?: (range: { from: Date; to: Date }) => void;
}

const EARLIEST_DATE = "2000-01-01";

const periodButtons: { value: UnifiedPeriod; label: string }[] = [
  { value: "hoje", label: "Hoje" },
  { value: "ontem", label: "Ontem" },
  { value: "7dias", label: "7 dias" },
  { value: "mes", label: "Mês" },
  { value: "total", label: "Total" },
  { value: "personalizado", label: "Personalizado" },
];

function generateAvailableMonths(): string[] {
  const months: string[] = [];
  let y = 2025, m = 10;
  const now = new Date();
  const ey = now.getFullYear(), em = now.getMonth() + 1;
  while (y < ey || (y === ey && m <= em)) {
    months.push(`${y}-${String(m).padStart(2, "0")}`);
    m++;
    if (m > 12) { m = 1; y++; }
  }
  return months;
}

function monthLabel(mesKey: string): string {
  const [y, m] = mesKey.split("-").map(Number);
  const d = new Date(y, m - 1, 1);
  const raw = d.toLocaleDateString("pt-BR", { month: "short", year: "2-digit" });
  return raw.charAt(0).toUpperCase() + raw.slice(1);
}

export default function UnifiedPeriodFilter({
  value,
  onChange,
  selectedMonths,
  onMonthsChange,
  customRange,
  onCustomRangeChange,
}: Props) {
  const [monthPopoverOpen, setMonthPopoverOpen] = useState(false);
  const [calendarOpen, setCalendarOpen] = useState(false);

  const availableMonths = generateAvailableMonths();

  const handlePeriodClick = (period: UnifiedPeriod) => {
    onChange(period);
    if (period === "mes") {
      setMonthPopoverOpen(true);
    } else if (period === "personalizado") {
      setCalendarOpen(true);
    }
  };

  const handleMonthClick = (mesKey: string) => {
    if (selectedMonths.length === 1 && selectedMonths[0] === mesKey) {
      // Deselect
      onMonthsChange([]);
      return;
    }

    if (selectedMonths.length === 1 && selectedMonths[0] !== mesKey) {
      // Select range between the two
      const idx1 = availableMonths.indexOf(selectedMonths[0]);
      const idx2 = availableMonths.indexOf(mesKey);
      const start = Math.min(idx1, idx2);
      const end = Math.max(idx1, idx2);
      onMonthsChange(availableMonths.slice(start, end + 1));
      return;
    }

    // Single select
    onMonthsChange([mesKey]);
  };

  const selectedMonthsLabel = () => {
    if (selectedMonths.length === 0) return "Mês";
    if (selectedMonths.length === 1) return monthLabel(selectedMonths[0]);
    return `${monthLabel(selectedMonths[0])} — ${monthLabel(selectedMonths[selectedMonths.length - 1])}`;
  };

  const customRangeLabel = () => {
    if (!customRange?.from || !customRange?.to) return "Personalizado";
    return `${format(customRange.from, "dd/MM", { locale: ptBR })} - ${format(customRange.to, "dd/MM", { locale: ptBR })}`;
  };

  return (
    <div className="space-y-1">
      <span className="text-sm font-medium text-muted-foreground">Período:</span>
      <div className="flex items-center gap-1 flex-wrap">
        {periodButtons.map((opt) => {
          if (opt.value === "mes") {
            return (
              <Popover key={opt.value} open={monthPopoverOpen} onOpenChange={setMonthPopoverOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant={value === "mes" ? "default" : "outline"}
                    size="sm"
                    onClick={() => handlePeriodClick("mes")}
                    className="text-xs"
                  >
                    {value === "mes" ? selectedMonthsLabel() : opt.label}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-3" align="start">
                  <p className="text-xs font-medium text-muted-foreground mb-2">
                    Selecione um mês ou dois para intervalo
                  </p>
                  <div className="grid grid-cols-3 gap-1.5">
                    {availableMonths.map((mk) => (
                      <Button
                        key={mk}
                        variant={selectedMonths.includes(mk) ? "default" : "outline"}
                        size="sm"
                        className="text-xs h-8"
                        onClick={() => handleMonthClick(mk)}
                      >
                        {monthLabel(mk)}
                      </Button>
                    ))}
                  </div>
                </PopoverContent>
              </Popover>
            );
          }

          if (opt.value === "personalizado") {
            return (
              <Popover key={opt.value} open={calendarOpen} onOpenChange={setCalendarOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant={value === "personalizado" ? "default" : "outline"}
                    size="sm"
                    onClick={() => handlePeriodClick("personalizado")}
                    className="text-xs"
                  >
                    <CalendarIcon className="h-3.5 w-3.5 mr-1" />
                    {value === "personalizado" ? customRangeLabel() : opt.label}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    initialFocus
                    mode="range"
                    defaultMonth={customRange?.from}
                    selected={{ from: customRange?.from, to: customRange?.to }}
                    onSelect={(range) => {
                      if (!range?.from || !onCustomRangeChange) return;
                      // Persist first click (start date) so user can then pick a new end date.
                      onCustomRangeChange({ from: range.from, to: range.to ?? range.from });
                      if (range.to) {
                        setCalendarOpen(false);
                      }
                    }}
                    disabled={(date) => date > new Date()}
                    numberOfMonths={2}
                    locale={ptBR}
                    className={cn("p-3 pointer-events-auto")}
                  />
                </PopoverContent>
              </Popover>
            );
          }

          return (
            <Button
              key={opt.value}
              variant={value === opt.value ? "default" : "outline"}
              size="sm"
              onClick={() => handlePeriodClick(opt.value)}
              className="text-xs"
            >
              {opt.label}
            </Button>
          );
        })}
      </div>
    </div>
  );
}

/** Get date range from unified filter state */
export function getRangeFromFilter(
  value: UnifiedPeriod,
  selectedMonths: string[],
  customRange?: { from: Date; to: Date }
): { from: Date; to: Date } {
  const today = new Date();

  switch (value) {
    case "hoje":
      return { from: startOfDay(today), to: endOfDay(today) };
    case "ontem": {
      const yesterday = subDays(today, 1);
      return { from: startOfDay(yesterday), to: endOfDay(yesterday) };
    }
    case "7dias":
      return { from: startOfDay(subDays(today, 6)), to: endOfDay(today) };
    case "mes": {
      if (selectedMonths.length > 0) {
        const sorted = [...selectedMonths].sort();
        const [fy, fm] = sorted[0].split("-").map(Number);
        const [ly, lm] = sorted[sorted.length - 1].split("-").map(Number);
        return {
          from: startOfMonth(new Date(fy, fm - 1, 1)),
          to: endOfMonth(new Date(ly, lm - 1, 1)),
        };
      }
      return { from: startOfMonth(today), to: endOfMonth(today) };
    }
    case "total":
      return { from: new Date(EARLIEST_DATE), to: endOfDay(today) };
    case "personalizado":
      return customRange || { from: startOfMonth(today), to: endOfMonth(today) };
  }
}

/** Get month key "YYYY-MM" from a Date */
export function getMonthKeyFromRange(from: Date): string {
  return `${from.getFullYear()}-${String(from.getMonth() + 1).padStart(2, "0")}`;
}
