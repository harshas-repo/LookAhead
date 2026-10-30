/**
 * Tiny in-memory stale-while-revalidate cache for client-fetched data.
 *
 * Every journey screen re-mounts on client-side navigation, and each one used to
 * refetch (guide, options, plan) from scratch — flashing a loading state on every
 * page change. This cache lets a screen render its last-known data instantly and
 * refresh quietly in the background, so moving back and forth feels immediate.
 *
 * Keys are namespaced by session id; the cache is cleared on privacy reset.
 */

const store = new Map<string, unknown>();

export function cacheGet<T>(key: string): T | undefined {
  return store.get(key) as T | undefined;
}

export function cacheSet<T>(key: string, value: T): void {
  store.set(key, value);
}

export function cacheClear(): void {
  store.clear();
}
