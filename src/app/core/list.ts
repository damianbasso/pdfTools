export function reorderById<T extends { id: string }>(
  items: readonly T[],
  ids: readonly string[],
): T[] {
  const byId = new Map(items.map((item) => [item.id, item]));
  const next: T[] = [];
  for (const id of ids) {
    const item = byId.get(id);
    if (item) next.push(item);
  }
  return next.length === items.length ? next : [...items];
}

export function moveById<T extends { id: string }>(
  items: readonly T[],
  id: string,
  direction: -1 | 1,
): T[] {
  const index = items.findIndex((item) => item.id === id);
  const target = index + direction;
  if (index < 0 || target < 0 || target >= items.length) return [...items];
  const next = items.slice();
  const [item] = next.splice(index, 1);
  if (!item) return [...items];
  next.splice(target, 0, item);
  return next;
}
