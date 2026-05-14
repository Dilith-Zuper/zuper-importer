/**
 * Run async work with a concurrency cap. Used to bound parallel fan-out so we
 * don't pin a connection pool with N pending promises at once.
 *
 * Usage:
 *   const results = await mapWithLimit(items, 5, async (item) => fetchSomething(item))
 *
 * Resolves to results in the same order as `items`. Any rejection rejects the
 * whole call — switch to Promise.allSettled inside the worker if partial-failure
 * tolerance is needed.
 */
export async function mapWithLimit<T, R>(
  items: T[],
  limit: number,
  // PromiseLike so we can accept Supabase query builders directly (their .then
  // signature returns PromiseLike, not strict Promise, until awaited).
  fn: (item: T, index: number) => PromiseLike<R>,
): Promise<R[]> {
  if (limit <= 0) throw new Error('limit must be > 0')
  const results: R[] = new Array(items.length)
  let next = 0

  async function worker() {
    while (true) {
      const i = next++
      if (i >= items.length) return
      results[i] = await fn(items[i], i)
    }
  }

  const workerCount = Math.min(limit, items.length)
  const workers = Array.from({ length: workerCount }, () => worker())
  await Promise.all(workers)
  return results
}
