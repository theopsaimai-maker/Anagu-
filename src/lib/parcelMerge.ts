import { ParcelRecord } from '../types/anagu';

/**
 * Merges parcel arrays by priority order (earlier lists win when IDs collide).
 * Callers must pass authoritative Express/Supabase parcel lists first and secondary
 * Firestore fallback lists second so stale snapshots never overwrite authoritative state.
 */
export function mergeParcelLists(...lists: ParcelRecord[][]): ParcelRecord[] {
  const map = new Map<string, ParcelRecord>();
  for (const list of lists) {
    for (const item of list) {
      if (!item || !item.id) continue;
      if (!map.has(item.id)) {
        map.set(item.id, item);
      }
    }
  }
  return Array.from(map.values()).sort((a, b) => b.id.localeCompare(a.id));
}
