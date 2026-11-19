/*
 * Price book resolution for ACO.
 * The PaaS core GraphQL (Commerce Optimizer Connector, CommerceAdapter module) answers
 * commerceOptimizer { priceBookId } for the current session: websiteCode::sha1(groupId),
 * guest group 0. The id is cached per browser session and store view, and the configured
 * base price book is used when the call fails or returns nothing.
 */

export const PRICE_BOOK_QUERY = {
  name: 'CommerceOptimizerPriceBook',
  // POST: the answer depends on the session, it must never land in a shared cache.
  method: 'POST',
  query: 'query CommerceOptimizerPriceBook { commerceOptimizer { priceBookId } }',
};

export const priceBookCacheKey = (store) => `commerce-pricebook:${store}`;

/**
 * @param {object} opts
 * @param {Function} [opts.runCore] runner bound to the PaaS core endpoint
 * @param {string} opts.store store view code
 * @param {string} [opts.baseId] configured base price book (lpg_group, wellbox)
 * @param {boolean} [opts.enabled] false skips the core call (views that show no price)
 * @param {Storage} [opts.storage] sessionStorage-like object
 */
export function createPriceBookResolver({
  runCore, store, baseId = '', enabled = true, storage,
}) {
  const key = priceBookCacheKey(store);
  let memo = null;
  let pending = null;

  const read = () => {
    if (memo) return memo;
    try {
      return storage?.getItem(key) || null;
    } catch (e) {
      return null;
    }
  };
  const write = (id) => {
    memo = id;
    try {
      storage?.setItem(key, id);
    } catch (e) { /* storage full or blocked: memory only */ }
  };

  async function get() {
    if (!enabled || !runCore) return baseId;
    const cached = read();
    if (cached) return cached;
    if (!pending) {
      pending = runCore(PRICE_BOOK_QUERY)
        .then(({ data }) => {
          const id = data?.commerceOptimizer?.priceBookId;
          if (typeof id === 'string' && id) {
            write(id);
            return id;
          }
          return baseId;
        })
        // Not cached: the next page tries again.
        .catch(() => baseId)
        .finally(() => { pending = null; });
    }
    return pending;
  }

  /** Call after sign in or sign out: the customer group changes the price book. */
  function reset() {
    memo = null;
    try {
      storage?.removeItem(key);
    } catch (e) { /* ignore */ }
  }

  return { get, reset, baseId };
}
