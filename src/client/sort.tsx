import { useMemo, useState } from "react";

export type SortDir = 1 | -1;

export function useSearchSort<T>(
  items: T[],
  searchText: (item: T) => string,
  valueFor: (item: T, key: string) => string | number,
  defaultKey: string,
  defaultDir: SortDir = -1,
) {
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState(defaultKey);
  const [sortDir, setSortDir] = useState<SortDir>(defaultDir);

  const toggle = (key: string) => {
    if (key === sortKey) setSortDir((d) => (d === 1 ? -1 : 1));
    else {
      setSortKey(key);
      setSortDir(1);
    }
  };

  const sorted = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = q
      ? items.filter((it) => searchText(it).toLowerCase().includes(q))
      : items;
    const dir = sortDir;
    return [...filtered].sort((a, b) => {
      const va = valueFor(a, sortKey);
      const vb = valueFor(b, sortKey);
      let cmp: number;
      if (typeof va === "number" && typeof vb === "number") cmp = va - vb;
      else cmp = String(va).localeCompare(String(vb));
      return cmp * dir;
    });
  }, [items, query, sortKey, sortDir]);

  return { query, setQuery, sortKey, sortDir, toggle, sorted };
}

export function SortTh({
  label,
  active,
  dir,
  onClick,
}: {
  label: string;
  active: boolean;
  dir: SortDir;
  onClick: () => void;
}) {
  return (
    <th className={`sortable${active ? " sort-active" : ""}`} onClick={onClick}>
      {label}
      {active ? (dir === 1 ? " ↑" : " ↓") : ""}
    </th>
  );
}
