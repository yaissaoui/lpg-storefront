/*
 * Maps raw Commerce GraphQL payloads to the stable shapes documented in README.md.
 * Blocks only ever see these shapes. When the backend moves to SaaS (Catalog Service or
 * ACCS), only the queries and this file change.
 */

const str = (v) => (typeof v === 'string' ? v : '');

export function normaliseMoney(raw) {
  if (!raw || typeof raw.value !== 'number') return null;
  return { value: raw.value, currency: raw.currency || '' };
}

export function normalisePrice(priceRange) {
  const min = priceRange?.minimum_price;
  if (!min) return null;
  const regular = normaliseMoney(min.regular_price);
  const final = normaliseMoney(min.final_price) || regular;
  if (!final) return null;
  return {
    regular: regular || final,
    final,
    discounted: !!regular && final.value < regular.value,
  };
}

export function normaliseImage(raw) {
  if (!raw?.url) return null;
  return { url: raw.url, label: str(raw.label) };
}

export function productType(typename) {
  return str(typename).replace(/Product$/, '').toLowerCase() || 'simple';
}

/** custom_attributesV2 items -> { code: 'text value' } */
export function attributesToMap(items = []) {
  return items.reduce((acc, item) => {
    if (!item?.code) return acc;
    if (typeof item.value === 'string') acc[item.code] = item.value;
    else if (Array.isArray(item.selected_options)) {
      acc[item.code] = item.selected_options.map((o) => o.label).join(', ');
    }
    return acc;
  }, {});
}

function normaliseBreadcrumbs(list = []) {
  return (list || []).map((b) => ({
    name: str(b.category_name),
    urlPath: str(b.category_url_path),
  }));
}

export function productBreadcrumbs(categories = []) {
  const deepest = [...(categories || [])]
    .filter((c) => c?.url_path)
    .sort((a, b) => b.url_path.split('/').length - a.url_path.split('/').length)[0];
  if (!deepest) return [];
  const self = { name: str(deepest.name), urlPath: deepest.url_path };
  return [...normaliseBreadcrumbs(deepest.breadcrumbs), self];
}

/** Summary shape, used by lists and search. */
export function normaliseProductSummary(raw) {
  if (!raw) return null;
  return {
    id: str(raw.uid),
    sku: str(raw.sku),
    name: str(raw.name),
    urlKey: str(raw.url_key),
    // eslint-disable-next-line no-underscore-dangle
    type: productType(raw.__typename),
    inStock: raw.stock_status !== 'OUT_OF_STOCK',
    image: normaliseImage(raw.small_image),
    shortDescription: str(raw.short_description?.html),
    price: normalisePrice(raw.price_range),
  };
}

/** Full shape, used by the product page. */
export function normaliseProduct(raw) {
  if (!raw) return null;
  const summary = normaliseProductSummary(raw);
  const gallery = (raw.media_gallery || [])
    .filter((m) => m && !m.disabled && m.url)
    .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
    .map(normaliseImage);
  return {
    ...summary,
    description: str(raw.description?.html),
    metaTitle: str(raw.meta_title) || summary.name,
    metaDescription: str(raw.meta_description),
    images: gallery.length ? gallery : [summary.image].filter(Boolean),
    attributes: attributesToMap(raw.custom_attributesV2?.items),
    options: (raw.configurable_options || []).map((o) => ({
      id: str(o.uid),
      code: str(o.attribute_code),
      label: str(o.label),
      values: (o.values || []).map((v) => ({ id: str(v.uid), label: str(v.label) })),
    })),
    categories: (raw.categories || []).map((c) => ({
      id: str(c.uid), name: str(c.name), urlPath: str(c.url_path),
    })),
    breadcrumbs: productBreadcrumbs(raw.categories),
  };
}

export function normaliseCategory(raw) {
  if (!raw) return null;
  return {
    id: str(raw.uid),
    name: str(raw.name),
    urlPath: str(raw.url_path),
    description: str(raw.description),
    image: raw.image ? { url: raw.image, label: str(raw.name) } : null,
    metaTitle: str(raw.meta_title) || str(raw.name),
    metaDescription: str(raw.meta_description),
    breadcrumbs: normaliseBreadcrumbs(raw.breadcrumbs),
  };
}

export function normaliseProductPage(raw, fallback = {}) {
  const info = raw?.page_info || {};
  return {
    items: (raw?.items || []).map(normaliseProductSummary).filter(Boolean),
    page: {
      current: info.current_page || fallback.page || 1,
      size: info.page_size || fallback.pageSize || 0,
      totalPages: info.total_pages || 0,
      totalCount: raw?.total_count || 0,
    },
  };
}

function normaliseNode(raw) {
  return {
    id: str(raw.uid),
    name: str(raw.name),
    urlPath: str(raw.url_path),
    position: raw.position ?? 0,
    children: (raw.children || [])
      .filter((c) => c && c.include_in_menu !== 0 && c.include_in_menu !== false)
      .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
      .map(normaliseNode),
  };
}

/** categoryList returns the store root. The menu is its children. */
export function normaliseCategoryTree(list) {
  const root = Array.isArray(list) ? list[0] : list;
  if (!root) return [];
  return normaliseNode(root).children;
}

export function normaliseCart(raw) {
  if (!raw) return null;
  return {
    id: str(raw.id),
    totalQuantity: raw.total_quantity || 0,
    items: (raw.items || []).filter(Boolean).map((i) => ({
      id: str(i.uid),
      sku: str(i.product?.sku),
      name: str(i.product?.name),
      urlKey: str(i.product?.url_key),
      image: normaliseImage(i.product?.small_image),
      quantity: i.quantity || 0,
      options: (i.configurable_options || []).map((o) => ({
        label: str(o.option_label), value: str(o.value_label),
      })),
      unitPrice: normaliseMoney(i.prices?.price),
      unitPriceInclTax: normaliseMoney(i.prices?.price_including_tax),
      rowTotal: normaliseMoney(i.prices?.row_total),
      rowTotalInclTax: normaliseMoney(i.prices?.row_total_including_tax),
    })),
    subtotal: normaliseMoney(raw.prices?.subtotal_including_tax),
    grandTotal: normaliseMoney(raw.prices?.grand_total),
  };
}

export function emptyCart() {
  return {
    id: '', totalQuantity: 0, items: [], subtotal: null, grandTotal: null,
  };
}
