export const WATER_TRUCK_CATEGORIES = ['represa'] as const;
export const TRUCK_CATEGORIES = ['transporte_insumo'] as const;
export const WATER_AND_TRUCK_CATEGORIES = [
  ...WATER_TRUCK_CATEGORIES,
  ...TRUCK_CATEGORIES,
] as const;

export interface PoiLike {
  id: string;
  category?: string;
}

export function normalizeCategory(category?: string): string {
  return category || 'marcacao';
}

export function isGroupHidden(
  hiddenCategories: ReadonlySet<string>,
  categories: readonly string[]
): boolean {
  return categories.length > 0 && categories.every((cat) => hiddenCategories.has(cat));
}

export function setGroupHidden(
  hiddenCategories: ReadonlySet<string>,
  categories: readonly string[],
  hidden: boolean
): Set<string> {
  const next = new Set(hiddenCategories);
  for (const cat of categories) {
    if (hidden) next.add(cat);
    else next.delete(cat);
  }
  return next;
}

export function toggleCategoryGroup(
  hiddenCategories: ReadonlySet<string>,
  categories: readonly string[]
): Set<string> {
  const currentlyHidden = isGroupHidden(hiddenCategories, categories);
  return setGroupHidden(hiddenCategories, categories, !currentlyHidden);
}

export function filterVisiblePois<T extends PoiLike>(
  pois: readonly T[],
  hiddenCategories: ReadonlySet<string>
): T[] {
  if (hiddenCategories.size === 0) return [...pois];
  return pois.filter((poi) => !hiddenCategories.has(normalizeCategory(poi.category)));
}

export function countCategoryGroup(
  pois: readonly PoiLike[],
  categories: readonly string[]
): number {
  const set = new Set(categories);
  let count = 0;
  for (const poi of pois) {
    if (set.has(normalizeCategory(poi.category))) count += 1;
  }
  return count;
}

export function parseHiddenCategories(raw: string | null | undefined): Set<string> {
  if (!raw) return new Set();
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((item): item is string => typeof item === 'string' && item.length > 0));
  } catch {
    return new Set();
  }
}

export function serializeHiddenCategories(hiddenCategories: ReadonlySet<string>): string {
  return JSON.stringify(Array.from(hiddenCategories).sort());
}
