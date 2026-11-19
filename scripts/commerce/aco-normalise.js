/*
 * Maps ACO Merchandising API payloads (ProductView, CategoryTreeView, ...) to the same stable
 * shapes as normalise.js. Blocks cannot tell which backend answered.
 */

const str = (v) => (typeof v === 'string' ? v : '');

function money(amount) {
  if (!amount || typeof amount.value !== 'number') return null;
  return { value: amount.value, currency: str(amount.currency) };
}

/** ProductViewPrice -> Price. A price whose roles say hidden is dropped. */
export function acoPrice(raw) {
  if (!raw) return null;
  if (Array.isArray(raw.roles) && raw.roles.includes('hidden')) return null;
  const regular = money(raw.regular?.amount);
  const final = money(raw.final?.amount) || regular;
  if (!final) return null;
  return {
    regular: regular || final,
    final,
    discounted: !!regular && final.value < regular.value,
  };
}

/** Simple products carry price, complex products carry priceRange (minimum is shown). */
export function acoProductPrice(raw) {
  if (!raw) return null;
  if (raw.price !== undefined) return acoPrice(raw.price);
  return acoPrice(raw.priceRange?.minimum);
}

const round2 = (v) => Math.round((v + Number.EPSILON) * 100) / 100;

/**
 * ACO price books hold prices excluding tax (the connector exports them that way, checked on
 * the sandbox on 19 Nov 2026: 832.50 in ACO for 999.00 incl. VAT on PaaS). A store view that
 * displays prices including tax sets aco.taxRate (0.2 for French VAT). One rate per view is an
 * approximation: it ignores product tax classes and the customer address.
 * @param {object|null} price normalised Price
 * @param {number} rate 0.2 for 20 %
 */
export function acoPriceWithTax(price, rate) {
  if (!price || !(rate > 0)) return price;
  const add = (m) => (m ? { ...m, value: round2(m.value * (1 + rate)) } : m);
  return { ...price, regular: add(price.regular), final: add(price.final) };
}

/** True when a ProductView has no usable price in the current price book. */
export function acoMissingPrice(raw) {
  return !!raw && acoProductPrice(raw) === null;
}

function decode(id) {
  try {
    return typeof atob === 'function' ? atob(id) : '';
  } catch (e) {
    return '';
  }
}

/**
 * Magento option uids are base64 of "configurable/<attribute id>/<value id>" or
 * "bundle/...". The sandbox returns these as ACO option value ids (checked live).
 */
export function isMagentoOptionUid(id) {
  return /^(configurable|bundle|bundle_item|custom-option)\//.test(decode(str(id)));
}

export function acoProductType(raw) {
  // eslint-disable-next-line no-underscore-dangle
  const typename = str(raw?.__typename);
  if (typename !== 'ComplexProductView') return 'simple';
  const firstId = raw.options?.[0]?.values?.[0]?.id;
  const kind = decode(str(firstId)).split('/')[0];
  if (kind === 'configurable') return 'configurable';
  if (kind.startsWith('bundle')) return 'bundle';
  return 'complex';
}

function image(raw) {
  return raw?.url ? { url: raw.url, label: str(raw.label) } : null;
}

/** Card image: small_image role first, then image, then the first entry. */
export function acoCardImage(images = []) {
  const list = (images || []).filter((i) => i?.url);
  const byRole = (role) => list.find((i) => (i.roles || []).includes(role));
  return image(byRole('small_image') || byRole('image') || list[0]);
}

/** Complex products are in stock when at least one option value is. Simple: assumed true. */
function acoInStock(raw) {
  const values = (raw.options || []).flatMap((o) => o?.values || []);
  if (!values.length) return true;
  return values.some((v) => v && v.inStock !== false);
}

export function acoAttributesToMap(list = []) {
  return (list || []).reduce((acc, a) => {
    if (!a?.name) return acc;
    const v = a.value;
    if (typeof v === 'string') acc[a.name] = v;
    else if (typeof v === 'number' || typeof v === 'boolean') acc[a.name] = String(v);
    else if (Array.isArray(v)) acc[a.name] = v.map(String).join(', ');
    return acc;
  }, {});
}

export function acoBreadcrumbs(categories = []) {
  const deepest = [...(categories || [])]
    .filter((c) => c?.slug)
    .sort((a, b) => (b.level ?? 0) - (a.level ?? 0))[0];
  if (!deepest) return [];
  return [...(deepest.parents || []), deepest]
    .filter((c) => c?.slug)
    .map((c) => ({ name: str(c.name), urlPath: c.slug }));
}

export function normaliseAcoProductSummary(raw) {
  if (!raw) return null;
  return {
    id: str(raw.id),
    sku: str(raw.sku),
    name: str(raw.name),
    urlKey: str(raw.urlKey),
    type: acoProductType(raw),
    inStock: acoInStock(raw),
    image: acoCardImage(raw.images),
    shortDescription: str(raw.shortDescription),
    price: acoProductPrice(raw),
  };
}

export function normaliseAcoProduct(raw) {
  if (!raw) return null;
  const summary = normaliseAcoProductSummary(raw);
  const images = (raw.images || []).map(image).filter(Boolean);
  return {
    ...summary,
    description: str(raw.description),
    metaTitle: str(raw.metaTitle) || summary.name,
    metaDescription: str(raw.metaDescription),
    images: images.length ? images : [summary.image].filter(Boolean),
    attributes: acoAttributesToMap(raw.attributes),
    options: (raw.options || []).filter(Boolean).map((o) => ({
      id: str(o.id),
      code: str(o.id),
      label: str(o.title),
      values: (o.values || []).filter(Boolean).map((v) => ({ id: str(v.id), label: str(v.title) })),
    })),
    categories: (raw.categories || []).filter((c) => c?.slug).map((c) => ({
      id: c.slug, name: str(c.name), urlPath: c.slug,
    })),
    breadcrumbs: acoBreadcrumbs(raw.categories),
  };
}

/**
 * @param {object[]} nodes categoryTree result for [ancestors..., slug]
 * @param {string} slug requested category slug
 */
export function normaliseAcoCategory(nodes, slug) {
  const list = (nodes || []).filter(Boolean);
  const raw = list.find((n) => n.slug === slug);
  if (!raw) return null;
  const byslug = new Map(list.map((n) => [n.slug, n]));
  const parts = slug.split('/');
  const breadcrumbs = parts.slice(0, -1).map((_, i) => {
    const s = parts.slice(0, i + 1).join('/');
    return { name: str(byslug.get(s)?.name) || parts[i], urlPath: s };
  });
  const img = (raw.images || []).find((i) => i?.url);
  return {
    id: raw.slug,
    name: str(raw.name),
    urlPath: raw.slug,
    description: str(raw.description),
    image: img ? { url: img.url, label: str(img.label) || str(raw.name) } : null,
    metaTitle: str(raw.metaTags?.title) || str(raw.name),
    metaDescription: str(raw.metaTags?.description),
    breadcrumbs,
  };
}

/** ProductSearchResponse -> { items, page } */
export function normaliseAcoSearchPage(raw, fallback = {}) {
  const info = raw?.page_info || {};
  return {
    items: (raw?.items || [])
      .map((i) => normaliseAcoProductSummary(i?.productView))
      .filter(Boolean),
    page: {
      current: info.current_page || fallback.page || 1,
      size: info.page_size || fallback.pageSize || 0,
      totalPages: info.total_pages || 0,
      totalCount: raw?.total_count || 0,
    },
  };
}

function navNode(raw, index) {
  return {
    id: str(raw.slug),
    name: str(raw.name),
    urlPath: str(raw.slug),
    position: index,
    children: (raw.children || []).filter((c) => c?.slug).map(navNode),
  };
}

/** navigation(family) already returns the top level, in merchandising order. */
export function normaliseAcoNavigation(list) {
  return (list || []).filter((c) => c?.slug).map(navNode);
}
