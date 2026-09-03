import { useMemo, useState } from "react";

import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export type OptionGroup = { label: string; options: { value: string; label: string }[] };

type Props = {
  id?: string;
  value?: string;
  groups: OptionGroup[];
  searchable?: boolean;
  placeholder?: string;
  onChange: (value: string) => void;
};

/** Select with grouped options, optional search, and support for legacy stored values. */
export function GroupedSelect({
  id,
  value,
  groups,
  searchable = false,
  placeholder = "Select...",
  onChange,
}: Props) {
  const [query, setQuery] = useState("");

  const allGroups = useMemo(() => {
    const known = groups.some((g) => g.options.some((o) => o.value === value));
    if (value && !known) {
      return [{ label: "Current", options: [{ value, label: value }] }, ...groups];
    }
    return groups;
  }, [groups, value]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return allGroups;
    return allGroups
      .map((g) => ({ ...g, options: g.options.filter((o) => o.label.toLowerCase().includes(q)) }))
      .filter((g) => g.options.length > 0);
  }, [allGroups, query]);

  return (
    <Select value={value || undefined} onValueChange={onChange}>
      <SelectTrigger id={id}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent className="max-h-72">
        {searchable ? (
          <div className="sticky top-0 z-10 bg-popover p-1">
            <Input
              value={query}
              placeholder="Search..."
              className="h-8"
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.stopPropagation()}
            />
          </div>
        ) : null}
        {filtered.length === 0 ? (
          <div className="px-2 py-3 text-sm text-muted-foreground">No matches</div>
        ) : (
          filtered.map((g) => (
            <SelectGroup key={g.label}>
              <SelectLabel>{g.label}</SelectLabel>
              {g.options.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectGroup>
          ))
        )}
      </SelectContent>
    </Select>
  );
}
