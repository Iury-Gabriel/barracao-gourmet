import { useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";

export interface FilterOption {
  value: string;
  label: string;
}

interface FilterSelectMultiProps {
  label: string;
  options: FilterOption[];
  selected: string[];
  onSelectionChange: (selected: string[]) => void;
  className?: string;
  /** Show search input inside the dropdown */
  searchable?: boolean;
  /** Label for the "select all" option, e.g. "Todos Closers" */
  selectAllLabel?: string;
}

export default function FilterSelectMulti({
  label,
  options,
  selected,
  onSelectionChange,
  className,
  searchable = false,
  selectAllLabel,
}: FilterSelectMultiProps) {
  const [open, setOpen] = useState(false);

  const allSelected = selected.length === options.length && options.length > 0;

  const toggleAll = () => {
    onSelectionChange(allSelected ? [] : options.map((o) => o.value));
  };

  const toggle = (value: string) => {
    onSelectionChange(
      selected.includes(value)
        ? selected.filter((v) => v !== value)
        : [...selected, value]
    );
  };

  // Display logic: 0 or all → label, 1 → value, 2+ → label
  const displayLabel =
    selected.length === 1
      ? options.find((o) => o.value === selected[0])?.label ?? label
      : label;

  const resolvedAllLabel = selectAllLabel ?? `Todos ${label}`;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className={cn("justify-between text-sm font-normal gap-1", className)}
        >
          <span className="truncate">{displayLabel}</span>
          <ChevronDown className="h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[220px] p-0" align="start">
        <Command>
          {searchable && <CommandInput placeholder={`Buscar ${label.toLowerCase()}...`} />}
          <CommandList>
            <CommandEmpty>Nenhum resultado.</CommandEmpty>
            <CommandGroup>
              {/* Select All option */}
              <CommandItem
                onSelect={toggleAll}
                className="flex items-center gap-2 cursor-pointer font-medium"
              >
                <Checkbox
                  checked={allSelected}
                  className="pointer-events-none"
                />
                <span className="text-sm">{resolvedAllLabel}</span>
                {allSelected && (
                  <Check className="ml-auto h-4 w-4 text-primary" />
                )}
              </CommandItem>
              {options.map((option) => {
                const isSelected = selected.includes(option.value);
                return (
                  <CommandItem
                    key={option.value}
                    onSelect={() => toggle(option.value)}
                    className="flex items-center gap-2 cursor-pointer"
                  >
                    <Checkbox
                      checked={isSelected}
                      className="pointer-events-none"
                    />
                    <span className="text-sm">{option.label}</span>
                    {isSelected && (
                      <Check className="ml-auto h-4 w-4 text-primary" />
                    )}
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
