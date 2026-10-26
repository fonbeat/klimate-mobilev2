export async function readPageRange<TPage, TItem>({ offset, pageSize, wanted, read, items, total, current, onPage }: {
  offset: number; pageSize: number; wanted: number;
  read: (offset: number, limit: number) => Promise<TPage>;
  items: (page: TPage) => TItem[]; total: (page: TPage) => number;
  current: () => boolean; onPage?: (page: TPage) => void;
}) {
  const records: TItem[] = [];
  let count = 0;
  do {
    const page = await read(offset + records.length, pageSize);
    if (!current()) return null;
    const next = items(page);
    records.push(...next);
    count = total(page);
    onPage?.(page);
    if (!next.length || offset + records.length >= count) break;
  } while (records.length < wanted);
  return { records, total: count };
}
