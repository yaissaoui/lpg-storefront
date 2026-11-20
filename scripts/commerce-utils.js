/*
 * Pure helpers for the commerce set-up. No browser globals and no drop-in imports,
 * so they run under node --test.
 */

/**
 * Where the public site configuration comes from, in order.
 * 1. /config.json is what the boilerplate reads. On aem.live it is served by the
 *    configuration service (tools.aem.live, "public" section of the site config).
 * 2. /config/site-config.public.json is the same JSON committed in this repository.
 *    It is used while the config service of yaissaoui/lpg-storefront holds no
 *    public section (on 20 November 2026 /config.json answers 404 on aem.page).
 */
export const CONFIG_SOURCES = ['/config.json', '/config/site-config.public.json'];

/**
 * Loads the first configuration that answers 200 with a "public" object.
 * @param {Function} fetchFn fetch implementation
 * @param {string} origin page origin
 * @param {string[]} [sources]
 * @returns {Promise<{ config: object, source: string }>}
 */
export async function loadPublicConfig(fetchFn, origin, sources = CONFIG_SOURCES) {
  const failures = [];
  // Sources are tried one after the other on purpose: the fallback is only read when needed.
  // eslint-disable-next-line no-restricted-syntax
  for (const source of sources) {
    try {
      // eslint-disable-next-line no-await-in-loop
      const resp = await fetchFn(`${origin}${source}`);
      if (resp.ok) {
        // eslint-disable-next-line no-await-in-loop
        const json = await resp.json();
        if (json && typeof json.public === 'object') return { config: json, source };
        failures.push(`${source}: no "public" section`);
      } else {
        failures.push(`${source}: HTTP ${resp.status}`);
      }
    } catch (e) {
      failures.push(`${source}: ${e.message}`);
    }
  }
  throw new Error(`No site configuration found (${failures.join(', ')})`);
}

/**
 * Product page path. Two shapes are accepted:
 * - /{root}/products/{urlKey}/{sku}, the boilerplate pattern;
 * - /{root}/products/{urlKey}, the pattern of the 63 DA pages of this lab.
 * @param {string} pathname
 * @returns {{ urlKey: string, sku: string } | null}
 */
export function parseProductPath(pathname = '') {
  const match = pathname.replace(/\.html$/, '').match(/\/products\/([^/]+)(?:\/([^/]+))?\/?$/);
  if (!match) return null;
  return {
    urlKey: decodeURIComponent(match[1]),
    sku: match[2] ? decodeURIComponent(match[2]) : '',
  };
}

/* ---------------------------------------------------------------------------
 * VAT on display prices.
 *
 * ACO returns prices excluding tax. Wellbox shows prices including 20 % VAT.
 * The drop-ins accept a model transformer (configuration, no change to drop-in
 * code). Both the PDP and the product-discovery drop-ins call it with the RAW
 * ProductView from the GraphQL answer and deep merge the returned object into
 * their own model. The functions below therefore read raw ACO fields and
 * return only the price fields of the model, with the tax added.
 * ------------------------------------------------------------------------- */

/** Adds the tax rate to an amount and rounds to the cent. */
export function addTax(value, rate) {
  if (typeof value !== 'number' || Number.isNaN(value)) return value;
  return Math.round(value * (1 + rate) * 100) / 100;
}

function rawAmount(price, key) {
  return price?.[key]?.amount?.value;
}

function taxedRawPrice(price, rate) {
  if (!price) return price;
  const out = { ...price };
  ['final', 'regular'].forEach((key) => {
    if (price[key]?.amount) {
      out[key] = {
        ...price[key],
        amount: { ...price[key].amount, value: addTax(price[key].amount.value, rate) },
      };
    }
  });
  return out;
}

/**
 * Transformer for storefront-product-discovery models.Product.
 * The discovery model keeps the raw price and priceRange shapes.
 * @param {object} raw ProductView from productSearch
 * @param {number} rate for example 0.2
 * @returns {object|undefined} partial model to merge
 */
export function discoveryVatTransformer(raw, rate) {
  if (!raw || !rate) return undefined;
  const out = {};
  if (raw.price) out.price = taxedRawPrice(raw.price, rate);
  if (raw.priceRange) {
    out.priceRange = {
      minimum: taxedRawPrice(raw.priceRange.minimum, rate),
      maximum: taxedRawPrice(raw.priceRange.maximum, rate),
    };
  }
  return out;
}

/**
 * Transformer for storefront-pdp models.ProductDetails.
 * The PDP model holds `prices` in its own shape, so this mirrors the branches of
 * the drop-in price mapping (storefront-pdp 3.4.0) for simple and configurable
 * products and returns only the amounts, with tax. Bundles are left untouched
 * (Wellbox sells none): an undefined result means "no change".
 * @param {object} raw ProductView from products(skus:) or refineProduct
 * @param {number} rate for example 0.2
 * @returns {object|undefined} partial model to merge
 */
export function pdpVatTransformer(raw, rate) {
  if (!raw || !rate) return undefined;
  const isBundle = raw.options?.[0]?.values?.[0]?.__typename === 'ProductViewOptionValueProduct';
  if (isBundle) return undefined;
  // Same tier shape and order as the drop-in, amounts with tax.
  const currency = raw.price?.regular?.amount?.currency;
  const tiers = (raw.price?.tiers || []).map((t) => ({
    tier: {
      amount: addTax(t?.tier?.amount?.value, rate),
      currency: t?.tier?.amount?.currency || currency,
    },
    quantity: t?.quantity?.[0]?.gte || t?.quantity?.[0]?.lt || 0,
  })).sort((a, b) => a.quantity - b.quantity);
  const withTiers = (prices) => (tiers.length ? { ...prices, tiers } : prices);

  if (raw.__typename === 'SimpleProductView' && raw.price) {
    const regular = rawAmount(raw.price, 'regular');
    const final = rawAmount(raw.price, 'final') ?? regular;
    return {
      prices: withTiers({
        regular: { amount: addTax(regular, rate) },
        final: { amount: addTax(final, rate) },
      }),
    };
  }
  if (raw.priceRange) {
    const min = rawAmount(raw.priceRange.minimum, 'final');
    const max = rawAmount(raw.priceRange.maximum, 'final');
    const minRegular = rawAmount(raw.priceRange.minimum, 'regular');
    const maxRegular = rawAmount(raw.priceRange.maximum, 'regular');
    const regular = minRegular === maxRegular ? minRegular : undefined;
    if (max && min === max) {
      return {
        prices: {
          regular: { amount: addTax(regular, rate) },
          final: { amount: addTax(max, rate) },
        },
      };
    }
    return {
      prices: {
        final: { minimumAmount: addTax(min, rate), maximumAmount: addTax(max, rate) },
      },
    };
  }
  return undefined;
}

/**
 * Price visibility of configurable products.
 * Observed on the sandbox on 20 November 2026: ACO returns `roles: []` on
 * priceRange.minimum and maximum of ComplexProductView (wellbox-2), while simple products
 * carry `roles: ["visible"]`. The PDP drop-in only shows a price whose roles contain
 * "visible", so every configurable parent showed no price. This transformer marks the
 * price visible when ACO sent an empty role list. A "hidden" role still hides it.
 * @param {object} raw ProductView
 * @returns {object|undefined} partial model to merge
 */
export function pdpPriceVisibilityTransformer(raw) {
  const range = raw?.priceRange;
  if (raw?.__typename !== 'ComplexProductView' || !range?.minimum || !range?.maximum) return undefined;
  const roles = [...(range.minimum.roles || []), ...(range.maximum.roles || [])];
  if (roles.length) return undefined;
  return { prices: { visible: true } };
}

/**
 * Runs several model transformers and merges their results (one level deep, enough for
 * the { prices: {...} } objects above).
 */
export function combineTransformers(...transformers) {
  return (raw) => {
    const results = transformers.map((t) => t(raw)).filter(Boolean);
    if (!results.length) return undefined;
    return results.reduce((acc, r) => {
      Object.entries(r).forEach(([key, value]) => {
        acc[key] = value && typeof value === 'object' && !Array.isArray(value)
          ? { ...acc[key], ...value }
          : value;
      });
      return acc;
    }, {});
  };
}

/**
 * Return path after sign in (?redirect=). Only a path of this site under the current store
 * root is accepted, so the parameter cannot send the shopper to another origin.
 * @param {string} value raw query parameter
 * @param {string} root store root, for example "/wellbox/fr/"
 * @returns {string|null} safe path with its query string, or null
 */
export function safeRedirectPath(value, root = '/') {
  if (!value || typeof value !== 'string') return null;
  if (!value.startsWith('/') || value.startsWith('//') || value.includes('\\')) return null;
  let url;
  try {
    url = new URL(value, 'https://example.com');
  } catch (e) {
    return null;
  }
  if (url.origin !== 'https://example.com') return null;
  const prefix = root.endsWith('/') ? root : `${root}/`;
  if (prefix !== '/' && !url.pathname.startsWith(prefix)) return null;
  return `${url.pathname}${url.search}`;
}
