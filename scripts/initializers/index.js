/*
 * Global drop-in set-up, adapted from scripts/initializers/index.js of
 * aem-boilerplate-commerce, state of the April 2026 suite release (commit 6fe10508, v8.0.0).
 *
 * Kept from the boilerplate: auth headers, the guest price book from the auth drop-in
 * (event auth/adobe-commerce-optimizer, read from PaaS `commerceOptimizer { priceBookId }`),
 * no-store on catalogue requests, cart reset when the website changes, cart id in session.
 *
 * Left out on purpose:
 * - setupCoreOptimizerHeaders. The boilerplate copies AC-View-ID and AC-Price-Book-ID onto
 *   core requests for ACCS tenants in CCDM mode. The PaaS sandbox does not need them and
 *   its CORS answer does not allow them (checked on 20 November 2026), so every cart call
 *   would fail in the browser.
 * - personalization, recaptcha, wishlist: not used in this lab.
 */
import { getCookie } from '@dropins/tools/lib.js';
import { events } from '@dropins/tools/event-bus.js';
import { initializers } from '@dropins/tools/initializer.js';
import { getRootPath } from '@dropins/tools/lib/aem/configs.js';
import { CORE_FETCH_GRAPHQL, CS_FETCH_GRAPHQL, fetchPlaceholders } from '../commerce.js';
import { getSiteContext } from '../site-config.js';

const DROPIN_WEBSITE_COOKIE = 'dropin_website_path';
const getWebsitePath = () => getRootPath() || '/';
const clearCookie = (name) => { document.cookie = `${name}=; path=/; Max-Age=0`; };
let catalogServiceCacheControlAdded = false;

export const getUserTokenCookie = () => getCookie('auth_dropin_user_token');

const setAuthHeaders = (state) => {
  if (state) {
    CORE_FETCH_GRAPHQL.setFetchGraphQlHeader('Authorization', `Bearer ${getUserTokenCookie()}`);
  } else {
    CORE_FETCH_GRAPHQL.removeFetchGraphQlHeader('Authorization');
  }
};

const setupCatalogServiceCacheControl = () => {
  if (catalogServiceCacheControlAdded) return;
  CS_FETCH_GRAPHQL.addBeforeHook((request) => ({ ...request, cache: 'no-store' }));
  catalogServiceCacheControlAdded = true;
};

/**
 * The auth drop-in emits the price book of the shopper (guest or customer group).
 * Without one, the base book from headers.cs stays (lpg_group or wellbox).
 */
const setAdobeCommerceOptimizerHeader = (adobeCommerceOptimizer) => {
  if (adobeCommerceOptimizer?.priceBookId) {
    CS_FETCH_GRAPHQL.setFetchGraphQlHeader('AC-Price-Book-ID', adobeCommerceOptimizer.priceBookId);
  }
};

const persistCartDataInSession = (data) => {
  if (data?.id) {
    sessionStorage.setItem('DROPINS_CART_ID', data.id);
  } else {
    sessionStorage.removeItem('DROPINS_CART_ID');
  }
};

export default async function initializeDropins() {
  const init = async () => {
    const ctx = await getSiteContext();
    // Prices and dates in the shopper's language (fr-FR, en-GB), not the en-US default.
    initializers.setGlobalLocale(ctx.numberLocale);

    setupCatalogServiceCacheControl();
    events.on('auth/adobe-commerce-optimizer', setAdobeCommerceOptimizerHeader, { eager: true });

    // A cart belongs to one website (LPG or Wellbox). Clear it when the root changes.
    const storedWebsitePath = getCookie(DROPIN_WEBSITE_COOKIE);
    const currentWebsitePath = getWebsitePath();
    if (storedWebsitePath && storedWebsitePath !== currentWebsitePath) {
      clearCookie('DROPIN__CART__CART-ID');
      sessionStorage.removeItem('DROPINS_CART_ID');
      sessionStorage.removeItem('DROPIN__CART__CART__DATA');
      sessionStorage.removeItem('DROPIN__CART__SHIPPING__DATA');
      localStorage.removeItem('DROPIN__CART__CART__AUTHENTICATED');
    }
    document.cookie = `${DROPIN_WEBSITE_COOKIE}=${currentWebsitePath}; path=/`;

    events.on('cart/data', persistCartDataInSession, { eager: true });

    setAuthHeaders(!!getUserTokenCookie());
    events.on('authenticated', setAuthHeaders);

    // Event bus logger on dev hosts only
    events.enableLogger(ctx.dev);

    await fetchPlaceholders('placeholders/global.json');

    // Auth fetches the price book from PaaS (adobeCommerceOptimizer: true)
    await import('./auth.js');

    // The cart and the mini cart only exist on views that sell
    if (ctx.sells) import('./cart.js');
  };

  document.addEventListener('prerenderingchange', initializeDropins, { once: true });

  return init();
}

export function initializeDropin(cb) {
  let initialized = false;

  const init = async (force = false) => {
    if (initialized && !force) return;
    await cb();
    initialized = true;
  };

  document.addEventListener('prerenderingchange', () => init(true), { once: true });

  return init;
}
