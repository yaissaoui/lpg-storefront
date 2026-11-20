/*
 * Commerce set-up for the drop-ins, adapted from scripts/commerce.js of
 * hlxsites/aem-boilerplate-commerce (April 2026 suite state). Same names and same split:
 * - CS_FETCH_GRAPHQL talks to the catalogue (Adobe Commerce Optimizer, `commerce-endpoint`,
 *   headers `cs`: AC-View-ID, AC-Price-Book-ID);
 * - CORE_FETCH_GRAPHQL talks to the PaaS core GraphQL (`commerce-core-endpoint`, headers
 *   `all`: Store) for the cart, the guest price book and later account and checkout.
 *
 * Differences with the boilerplate, all on purpose:
 * - the configuration is read from /config.json and, when that answers 404, from the
 *   committed config/site-config.public.json (see scripts/commerce-utils.js);
 * - product pages keep the lab URL /products/{urlKey}. The sku comes from
 *   <meta name="sku">, then /products/{urlKey}/{sku}, then an ACO lookup by url_key;
 * - no Adobe Client Data Layer, no event collector, no recommendations: the sandbox
 *   sends no data to Adobe (rule 8 of ../AGENTS.md).
 */
import { getCookie } from '@dropins/tools/lib.js';
import {
  getHeaders,
  getConfigValue,
  getRootPath,
  initializeConfig,
} from '@dropins/tools/lib/aem/configs.js';
import { events } from '@dropins/tools/event-bus.js';
import { FetchGraphQL } from '@dropins/tools/fetch-graphql.js';
import { getMetadata, readBlockConfig } from './aem.js';
import { loadPublicConfig, parseProductPath, safeRedirectPath } from './commerce-utils.js';
import { getSiteContext } from './site-config.js';
import initializeDropins from './initializers/index.js';

// Core Fetch GraphQL Instance (PaaS)
export const CORE_FETCH_GRAPHQL = new FetchGraphQL();

// Catalog Service Fetch GraphQL Instance (ACO)
export const CS_FETCH_GRAPHQL = new FetchGraphQL();

export const IS_DA = new URL(window.location.href).searchParams.has('dapreview');
// Universal Editor on Experience Workspace content (*.ue.da.live, *.stage-ue.da.live)
export const IS_UE = /\.(stage-ue|ue)\.da\.live$/.test(window.location.hostname);

// PATHS (relative to the store root, see rootLink). Same values as the boilerplate.
export const SUPPORT_PATH = '/contact';
export const PRIVACY_POLICY_PATH = '/donnees-personnelles';

// GUEST PATHS
export const ORDER_STATUS_PATH = '/order-status';
export const ORDER_DETAILS_PATH = '/order-details';
export const RETURN_DETAILS_PATH = '/return-details';
export const CREATE_RETURN_PATH = '/create-return';
export const SALES_GUEST_VIEW_PATH = '/sales/guest/view/';

// CUSTOMER PATHS
export const CUSTOMER_PATH = '/customer';
export const CUSTOMER_ORDER_DETAILS_PATH = `${CUSTOMER_PATH}${ORDER_DETAILS_PATH}`;
export const CUSTOMER_RETURN_DETAILS_PATH = `${CUSTOMER_PATH}${RETURN_DETAILS_PATH}`;
export const CUSTOMER_CREATE_RETURN_PATH = `${CUSTOMER_PATH}${CREATE_RETURN_PATH}`;
export const CUSTOMER_ORDERS_PATH = `${CUSTOMER_PATH}/orders`;
export const CUSTOMER_RETURNS_PATH = `${CUSTOMER_PATH}/returns`;
export const CUSTOMER_ADDRESS_PATH = `${CUSTOMER_PATH}/address`;
export const CUSTOMER_LOGIN_PATH = `${CUSTOMER_PATH}/login`;
export const CUSTOMER_ACCOUNT_PATH = `${CUSTOMER_PATH}/account`;
export const CUSTOMER_FORGOTPASSWORD_PATH = `${CUSTOMER_PATH}/forgotpassword`;
export const SALES_ORDER_VIEW_PATH = '/sales/order/view/';

// TRACKING URL
export const UPS_TRACKING_URL = 'https://www.ups.com/track';

/**
 * Privacy policy consent under the sign-up forms (boilerplate slot, text from placeholders
 * Global.PrivacyConsent*, French and English in placeholders/{lang}/global.json).
 */
export const authPrivacyPolicyConsentSlot = {
  PrivacyPolicyConsent: async (ctx) => {
    const labels = window.placeholders?._merged?.Global || {};
    const wrapper = document.createElement('span');
    Object.assign(wrapper.style, {
      color: 'var(--color-neutral-700)',
      font: 'var(--type-details-caption-2-font)',
      display: 'block',
      marginBottom: 'var(--spacing-medium)',
    });

    const link = document.createElement('a');
    link.href = rootLink(PRIVACY_POLICY_PATH);
    link.target = '_blank';
    link.textContent = labels.PrivacyPolicy || 'Privacy Policy';

    wrapper.append(
      labels.PrivacyConsentBefore || 'By creating an account, you acknowledge that you have read and agree to our ',
      link,
      labels.PrivacyConsentAfter || ', which outlines how we collect, use, and protect your personal data.',
    );

    ctx.appendChild(wrapper);
  },
};

const CONFIG_SESSION_KEY = 'config';
const CONFIG_TTL_SECONDS = 7200;

/**
 * Fetches the public site config and keeps it in session storage for two hours,
 * like the boilerplate. The cached copy records its source.
 * @returns {Promise<object>}
 */
export async function getConfigFromSession() {
  try {
    const cached = JSON.parse(window.sessionStorage.getItem(CONFIG_SESSION_KEY));
    if (cached?.[':expiry'] > Math.round(Date.now() / 1000)) return cached;
  } catch (e) {
    // cache unreadable, fetch again
  }
  const { origin } = window.location;
  const { config, source } = await loadPublicConfig(window.fetch.bind(window), origin);
  config[':expiry'] = Math.round(Date.now() / 1000) + CONFIG_TTL_SECONDS;
  config[':source'] = source;
  try {
    window.sessionStorage.setItem(CONFIG_SESSION_KEY, JSON.stringify(config));
  } catch (e) {
    // storage full or blocked, keep going without cache
  }
  return config;
}

/**
 * Root path of the current store ("/wellbox/fr/"), from the matched config key.
 * @param {string} link path starting with "/"
 */
export function rootLink(link) {
  const root = getRootPath().replace(/\/$/, '');
  if (link.startsWith(`${root}/`) || link === root) return link;
  return `${root}${link}`;
}

/**
 * Product page link. The lab keeps /products/{urlKey} because the DA pages exist at
 * that path. The sku argument is accepted for boilerplate compatibility and ignored.
 */
export function getProductLink(urlKey, _sku) {
  if (!urlKey) return rootLink('/');
  return rootLink(`/products/${encodeURIComponent(urlKey)}`);
}

export function getOptionsUIDsFromUrl() {
  return new URLSearchParams(window.location.search).get('optionsUIDs')?.split(',');
}

function getDefaultSkuFromBlock() {
  const block = document.querySelector('.product-details.block, .product-details');
  if (!block) return null;
  return readBlockConfig(block).sku || readBlockConfig(block).defaultsku || null;
}

const SKU_BY_URL_KEY = `query SkuByUrlKey($urlKey: String!) {
  productSearch(phrase: "", filter: [{ attribute: "url_key", eq: $urlKey }], page_size: 1) {
    items { productView { sku urlKey } }
  }
}`;

/**
 * Looks up the sku of a url key in the current ACO catalogue view, cached per view.
 * @param {string} urlKey
 * @returns {Promise<string|null>}
 */
export async function getSkuByUrlKey(urlKey) {
  const viewId = getHeaders('cs')['AC-View-ID'] || '';
  const cacheKey = `commerce-sku:${viewId}:${urlKey}`;
  try {
    const cached = window.sessionStorage.getItem(cacheKey);
    if (cached) return cached;
  } catch (e) { /* no cache */ }

  const { data, errors } = await CS_FETCH_GRAPHQL.fetchGraphQl(SKU_BY_URL_KEY, {
    method: 'GET',
    variables: { urlKey },
  });
  if (errors?.length) console.warn('sku lookup by url key', errors);
  const item = data?.productSearch?.items?.find((i) => i.productView?.urlKey === urlKey)
    || data?.productSearch?.items?.[0];
  const sku = item?.productView?.sku || null;
  if (sku) {
    try { window.sessionStorage.setItem(cacheKey, sku); } catch (e) { /* no cache */ }
  }
  return sku;
}

const NAVIGATION = `query Navigation($family: String!) {
  navigation(family: $family) { slug name children { slug name children { slug name } } }
}`;

/**
 * Category menu from ACO. The connector puts active categories with include_in_menu in
 * the family top_menu. No drop-in covers navigation, so the header reads it here
 * (blocks never call GraphQL). LPG fr and en have no categories in ACO: empty list.
 * @returns {Promise<Array<{ name, urlPath, children }>>}
 */
export async function getCategoryNavigation() {
  const { data, errors } = await CS_FETCH_GRAPHQL.fetchGraphQl(NAVIGATION, {
    method: 'GET',
    variables: { family: 'top_menu' },
  });
  if (errors?.length) throw new Error(errors[0].message);
  const node = (c) => ({
    name: c.name,
    urlPath: c.slug,
    children: (c.children || []).filter((x) => x?.slug).map(node),
  });
  return (data?.navigation || []).filter((c) => c?.slug).map(node);
}

const CATEGORY = `query Category($slugs: [String!]) {
  categoryTree(slugs: $slugs, depth: 1) { slug name description metaTags { title description } }
}`;

/**
 * Category heading data for a PLP (name, description, meta). The product-discovery
 * drop-in lists products but does not read the category itself.
 * @param {string} slug Magento url_path, for example "accessoires-wellbox"
 * @returns {Promise<{ name, description, metaTitle, metaDescription } | null>}
 */
export async function getCategory(slug) {
  const { data, errors } = await CS_FETCH_GRAPHQL.fetchGraphQl(CATEGORY, {
    method: 'GET',
    variables: { slugs: [slug] },
  });
  if (errors?.length) throw new Error(errors[0].message);
  const c = (data?.categoryTree || []).find((x) => x.slug === slug);
  if (!c) return null;
  return {
    name: c.name,
    description: c.description || '',
    metaTitle: c.metaTags?.title || c.name,
    metaDescription: c.metaTags?.description || '',
  };
}

/**
 * Sku of the current product page. Synchronous sources only.
 * @returns {string|null}
 */
export function getProductSku() {
  return getMetadata('sku')
    || parseProductPath(window.location.pathname)?.sku
    || getDefaultSkuFromBlock()
    || null;
}

/**
 * Sku of the current product page, with the url_key lookup as last resort.
 * @returns {Promise<string|null>}
 */
export async function resolveProductSku() {
  const sku = getProductSku();
  if (sku) return sku;
  const parsed = parseProductPath(window.location.pathname);
  if (!parsed?.urlKey) return null;
  return getSkuByUrlKey(parsed.urlKey);
}

/**
 * Preloads a file with specified attributes
 */
export function preloadFile(href, as) {
  const link = document.createElement('link');
  link.rel = 'preload';
  link.as = as;
  link.crossOrigin = 'anonymous';
  link.href = href;
  document.head.appendChild(link);
}

/**
 * Placeholders (drop-in labels), boilerplate format: { data: [{ Key, Value }] } with dotted
 * keys. The boilerplate reads them from DA at {root}placeholders/{file}.json. DA holds no
 * placeholders for this lab yet, so a 404 falls back to the committed copy in
 * /placeholders/{lang}/{file}.json.
 * @param {string} [path] for example 'placeholders/pdp.json'
 * @returns {Promise<object>} merged nested labels
 */
export async function fetchPlaceholders(path) {
  window.placeholders = window.placeholders || {};
  window.placeholders._merged = window.placeholders._merged || {};
  window.placeholders._pending = window.placeholders._pending || {};
  if (!path) return window.placeholders._merged;
  if (window.placeholders._pending[path]) return window.placeholders._pending[path];

  // DA sheets are read with ?sheet=data like the boilerplate. The committed files are plain
  // single-sheet JSON: the EDS JSON pipeline answers 404 to ?sheet=data on them.
  const load = async (url, sheet = true) => {
    try {
      const resp = await fetch(sheet ? `${url}?sheet=data` : url);
      if (!resp.ok) return null;
      const json = await resp.json();
      return json?.data?.length ? json : null;
    } catch (e) {
      return null;
    }
  };

  const promise = (async () => {
    const ctx = await getSiteContext();
    const file = path.replace(/^placeholders\//, '');
    const json = await load(getRootPath().replace(/\/$/, `/${path}`))
      || await load(`/placeholders/${ctx.lang}/${file}`, false)
      || await load(`/placeholders/en/${file}`, false);
    if (!json) {
      console.warn(`No placeholders for ${path}`);
      return window.placeholders._merged;
    }
    json.data.forEach(({ Key, Value }) => {
      if (!Key || Value === undefined) return;
      const keys = Key.split('.');
      const last = keys.pop();
      let target = window.placeholders._merged;
      keys.forEach((k) => {
        target[k] = target[k] || {};
        target = target[k];
      });
      target[last] = Value;
    });
    return window.placeholders._merged;
  })();

  window.placeholders._pending[path] = promise;
  return promise;
}

/** Notifies drop-ins about the loading state (boilerplate behaviour). */
function notifyUI(event) {
  if (events.lastPayload(`aem/${event}`) === event) return;
  const handleEmit = () => events.emit(`aem/${event}`);
  document.addEventListener('prerenderingchange', handleEmit, { once: true });
  handleEmit();
}

function detectPageType() {
  if (document.body.querySelector('main .product-details')) return 'Product';
  if (document.body.querySelector('main .product-list')) return 'Category';
  if (document.body.querySelector('main .commerce-cart')) return 'Cart';
  if (document.body.querySelector('main .commerce-checkout')) return 'Checkout';
  return 'CMS';
}

/** Loads commerce-specific eager content */
export async function loadCommerceEager() {
  if (detectPageType() === 'Product') {
    await import('./initializers/pdp.js');
  }
  notifyUI('lcp');
}

/** Initializes commerce configuration and the global drop-ins. */
export async function initializeCommerce() {
  initializeConfig(await getConfigFromSession());

  // Core (PaaS): Store header from headers.all
  CORE_FETCH_GRAPHQL.setEndpoint(getConfigValue('commerce-core-endpoint') || getConfigValue('commerce-endpoint'));
  CORE_FETCH_GRAPHQL.setFetchGraphQlHeaders((prev) => ({ ...prev, ...getHeaders('all') }));

  // Catalogue (ACO): AC-View-ID and AC-Price-Book-ID from headers.cs. The query string
  // hash makes the CDN cache vary on the headers, like the boilerplate.
  CS_FETCH_GRAPHQL.setEndpoint(commerceEndpointWithQueryParams());
  CS_FETCH_GRAPHQL.setFetchGraphQlHeaders((prev) => ({ ...prev, ...getHeaders('cs') }));

  return initializeDropins();
}

function createHashFromObject(obj, length = 5) {
  const objString = Object.entries(obj)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}:${value}`)
    .join('|');
  return objString
    .split('')
    .reduce((hash, char) => (hash * 31 + char.charCodeAt(0)) % 2147483647, 0)
    .toString(36)
    .slice(0, length);
}

export function commerceEndpointWithQueryParams() {
  const url = new URL(getConfigValue('commerce-endpoint'));
  url.searchParams.append('cb', createHashFromObject(getHeaders('cs')));
  return url.toString();
}

/**
 * "Columns" template of the boilerplate (account pages): sections carry a column width and
 * a gap from their section metadata. Applied whenever such sections exist, so local drafts
 * without the template metadata render the same way.
 * @param {Document} doc
 */
export function applyTemplates(doc) {
  const columns = doc.querySelectorAll('main > div.section[data-column-width]');
  if (!columns.length) return;
  doc.body.classList.add('columns');
  columns.forEach((column) => {
    const columnWidth = column.getAttribute('data-column-width');
    const gap = column.getAttribute('data-gap');
    if (columnWidth) {
      column.style.setProperty('--column-width', columnWidth);
      column.removeAttribute('data-column-width');
    }
    if (gap) {
      column.style.setProperty('--gap', `var(--spacing-${gap.toLocaleLowerCase()})`);
      column.removeAttribute('data-gap');
    }
  });
}

const GUEST_CHECKOUT = 'query GuestCheckout { storeConfig { is_guest_checkout_enabled } }';

/**
 * Whether the PaaS store view accepts guest checkout (storeConfig.is_guest_checkout_enabled).
 * The checkout drop-in reads the value but does not act on it, so the checkout block asks
 * here. Cached per store view for the session. Defaults to true when the query fails.
 * @returns {Promise<boolean>}
 */
export async function isGuestCheckoutEnabled() {
  const key = `commerce-guest-checkout:${getHeaders('all').Store || ''}`;
  try {
    const cached = window.sessionStorage.getItem(key);
    if (cached !== null) return cached === 'true';
  } catch (e) { /* no cache */ }
  try {
    const { data } = await CORE_FETCH_GRAPHQL.fetchGraphQl(GUEST_CHECKOUT, { method: 'GET' });
    const enabled = data?.storeConfig?.is_guest_checkout_enabled !== false;
    try { window.sessionStorage.setItem(key, String(enabled)); } catch (e) { /* no cache */ }
    return enabled;
  } catch (e) {
    return true;
  }
}

/**
 * Sign-in page link that comes back to the current page (?redirect=).
 * @param {string} [returnPath] defaults to the current path and query
 */
export function loginLinkReturningTo(returnPath = `${window.location.pathname}${window.location.search}`) {
  const url = new URL(rootLink(CUSTOMER_LOGIN_PATH), window.location.origin);
  url.searchParams.set('redirect', returnPath);
  return `${url.pathname}${url.search}`;
}

/** Path to open after sign in: a safe ?redirect= under the store root, or the fallback. */
export function redirectAfterSignIn(fallback) {
  const value = new URLSearchParams(window.location.search).get('redirect');
  return safeRedirectPath(value, getRootPath()) || fallback;
}

export function checkIsAuthenticated() {
  return !!getCookie('auth_dropin_user_token');
}

/**
 * Renders promotion labels for a cart item (boilerplate helper, cart and mini cart).
 */
export function renderCartItemPromotions(ctx) {
  const wrapper = document.createElement('div');
  wrapper.className = 'cart-item-promotions';
  ctx.onChange((next) => {
    wrapper.innerHTML = '';
    next.item?.discount?.label?.forEach((label) => {
      const div = document.createElement('div');
      div.className = 'cart-item-promotion-label';
      div.textContent = label;
      wrapper.appendChild(div);
    });
  });
  ctx.appendChild(wrapper);
  return wrapper;
}
