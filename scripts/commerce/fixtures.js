/*
 * FIXTURE mode: used when no commerce-endpoint is configured.
 * It answers the same operations as Commerce, in the raw GraphQL shape, so the
 * normalisation code runs exactly as it will against the sandbox.
 * Every value is fake: DEMO skus, example prices, local placeholder images.
 */

const IMG = '/images/demo';

const money = (value, currency) => ({ value, currency });
const priceRange = (regular, final, currency) => ({
  minimum_price: { regular_price: money(regular, currency), final_price: money(final, currency) },
});

const CATEGORIES = {
  lpg: [
    {
      uid: 'Q0FULTEw',
      name: 'Expertise esthétique',
      url_path: 'expertise-esthetique',
      position: 1,
      include_in_menu: 1,
      children: [
        {
          uid: 'Q0FULTEx',
          name: 'Cosmétiques',
          url_path: 'expertise-esthetique/cosmetiques',
          position: 1,
          include_in_menu: 1,
          children: [
            {
              uid: 'Q0FULTEy', name: 'Cosmétiques visage', url_path: 'expertise-esthetique/cosmetiques/cosmetiques-visage', position: 1, include_in_menu: 1, children: [],
            },
            {
              uid: 'Q0FULTEz', name: 'Cosmétiques corps', url_path: 'expertise-esthetique/cosmetiques/cosmetiques-corps', position: 2, include_in_menu: 1, children: [],
            },
          ],
        },
        {
          uid: 'Q0FULTE0', name: 'Technologies', url_path: 'expertise-esthetique/technologies', position: 2, include_in_menu: 1, children: [],
        },
      ],
    },
    {
      uid: 'Q0FULTIw', name: 'Expertise médicale', url_path: 'expertise-medicale', position: 2, include_in_menu: 1, children: [],
    },
    {
      uid: 'Q0FULTkw', name: 'Hidden demo category', url_path: 'hidden-demo', position: 9, include_in_menu: 0, children: [],
    },
  ],
  wellbox: [
    {
      uid: 'Q0FULTUw', name: 'Wellbox®', url_path: 'appareils', position: 1, include_in_menu: 1, children: [],
    },
    {
      uid: 'Q0FULTUx', name: 'Accessoires', url_path: 'accessoires', position: 2, include_in_menu: 1, children: [],
    },
    {
      uid: 'Q0FULTUy', name: 'Cosmétiques', url_path: 'cosmetiques', position: 3, include_in_menu: 1, children: [],
    },
  ],
};

const attrs = (application, ingredients, results) => ({
  items: [
    { code: 'application', value: application },
    { code: 'ingredients', value: ingredients },
    { code: 'results', value: results },
  ],
});

const lpgProduct = (n, name, urlKey, image, price, extra = {}) => ({
  __typename: 'SimpleProduct',
  uid: `UFJPRC0${n}`,
  sku: `DEMO-00${n}`,
  name,
  url_key: urlKey,
  stock_status: 'IN_STOCK',
  short_description: { html: `<p>Demo short description for ${name}. Fake content for the lab.</p>` },
  description: { html: `<p>${name} is a fixture product. This text is placeholder content written for the LPG migration lab on example data. It is not a real product description.</p>` },
  meta_title: `${name} | Demo`,
  meta_description: `Fixture page for ${name}.`,
  small_image: { url: `${IMG}/${image}.svg`, label: name },
  media_gallery: [
    {
      url: `${IMG}/${image}.svg`, label: name, position: 1, disabled: false,
    },
    {
      url: `${IMG}/demo-texture.svg`, label: `${name} texture`, position: 2, disabled: false,
    },
  ],
  price_range: priceRange(price, price, 'EUR'),
  categories: [
    {
      uid: 'Q0FULTEy',
      name: 'Cosmétiques visage',
      url_path: 'expertise-esthetique/cosmetiques/cosmetiques-visage',
      breadcrumbs: [
        { category_uid: 'Q0FULTEw', category_name: 'Expertise esthétique', category_url_path: 'expertise-esthetique' },
        { category_uid: 'Q0FULTEx', category_name: 'Cosmétiques', category_url_path: 'expertise-esthetique/cosmetiques' },
      ],
    },
  ],
  custom_attributesV2: attrs(
    '<p>Demo application text: apply morning and evening on clean skin.</p>',
    '<p>Aqua (demo), Glycerin (demo), Example extract.</p>',
    '<p>Demo results: 90% of 0 fake testers were satisfied. Placeholder only.</p>',
  ),
  ...extra,
});

const PRODUCTS = {
  lpg: [
    lpgProduct(1, 'Demo serum A', 'demo-serum-a', 'demo-bottle', 49, {
      __typename: 'ConfigurableProduct',
      configurable_options: [{
        uid: 'Y29uZmlndXJhYmxlLzkz',
        attribute_code: 'demo_volume',
        label: 'Contenances',
        values: [{ uid: 'Y29uZi8zMA==', label: '30 ml' }, { uid: 'Y29uZi8xMDA=', label: '100 ml' }],
      }],
    }),
    lpgProduct(2, 'Demo cream B', 'demo-cream-b', 'demo-jar', 59),
    lpgProduct(3, 'Demo mask C', 'demo-mask-c', 'demo-sachet', 19),
    lpgProduct(4, 'Demo eye care D', 'demo-eye-care-d', 'demo-bottle', 39),
    lpgProduct(5, 'Demo fluid E', 'demo-fluid-e', 'demo-tube', 45),
    lpgProduct(6, 'Demo cleanser F', 'demo-cleanser-f', 'demo-tube', 25),
    lpgProduct(7, 'Demo night care G', 'demo-night-care-g', 'demo-jar', 65),
    lpgProduct(8, 'Demo lip mask H', 'demo-lip-mask-h', 'demo-sachet', 15, { stock_status: 'OUT_OF_STOCK' }),
  ],
  wellbox: [
    {
      ...lpgProduct(1, 'Demo device W', 'demo-device-w', 'demo-device', 999),
      __typename: 'ConfigurableProduct',
      uid: 'UFJPRC1XMDE=',
      sku: 'DEMO-W01',
      price_range: priceRange(1299, 999, 'EUR'),
      categories: [{
        uid: 'Q0FULTUw', name: 'Wellbox®', url_path: 'appareils', breadcrumbs: [],
      }],
      configurable_options: [{
        uid: 'Y29uZmlndXJhYmxlLzkz',
        attribute_code: 'demo_colour',
        label: 'Couleur',
        values: [{ uid: 'Y29sL3doaXRl', label: 'Blanche' }, { uid: 'Y29sL3Jvc2U=', label: 'Rose' }],
      }],
    },
    {
      ...lpgProduct(2, 'Demo travel case W', 'demo-travel-case-w', 'demo-case', 70),
      uid: 'UFJPRC1XMDI=',
      sku: 'DEMO-W02',
      categories: [{
        uid: 'Q0FULTUx', name: 'Accessoires', url_path: 'accessoires', breadcrumbs: [],
      }],
    },
    {
      ...lpgProduct(3, 'Demo cream W', 'demo-cream-w', 'demo-jar', 84.5),
      uid: 'UFJPRC1XMDM=',
      sku: 'DEMO-W03',
      categories: [{
        uid: 'Q0FULTUy', name: 'Cosmétiques', url_path: 'cosmetiques', breadcrumbs: [],
      }],
    },
  ],
};

export function fixtureSiteOf(store = '') {
  return store.startsWith('wellbox_') ? 'wellbox' : 'lpg';
}

const clone = (v) => JSON.parse(JSON.stringify(v));

function flatten(nodes, out = []) {
  nodes.forEach((n) => {
    out.push(n);
    flatten(n.children || [], out);
  });
  return out;
}

function withCurrency(product, currency) {
  if (currency === 'EUR') return product;
  const p = clone(product);
  const min = p.price_range.minimum_price;
  min.regular_price.currency = currency;
  min.final_price.currency = currency;
  return p;
}

function page(items, pageSize, currentPage) {
  const size = Math.max(1, pageSize || 12);
  const current = Math.max(1, currentPage || 1);
  return {
    total_count: items.length,
    page_info: {
      current_page: current,
      page_size: size,
      total_pages: Math.ceil(items.length / size),
    },
    items: items.slice((current - 1) * size, current * size),
  };
}

const SORTERS = {
  name: (a, b) => a.name.localeCompare(b.name),
  price: (a, b) => a.price_range.minimum_price.final_price.value
    - b.price_range.minimum_price.final_price.value,
};

function sortItems(items, sort) {
  if (!sort) return items;
  const [field, dir] = Object.entries(sort)[0] || [];
  const fn = SORTERS[field];
  if (!fn) return items;
  const sorted = [...items].sort(fn);
  return dir === 'DESC' ? sorted.reverse() : sorted;
}

function memoryStorage() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
  };
}

const CARTS_KEY = 'commerce-fixture-carts';

function cartPayload(cart) {
  const items = cart.items.map((i) => ({
    uid: i.uid,
    quantity: i.quantity,
    product: {
      sku: i.sku, name: i.name, url_key: i.url_key, small_image: i.small_image,
    },
    prices: { row_total: money(Math.round(i.unit * i.quantity * 100) / 100, cart.currency) },
    configurable_options: i.options,
  }));
  const total = Math.round(cart.items.reduce((s, i) => s + i.unit * i.quantity, 0) * 100) / 100;
  return {
    id: cart.id,
    total_quantity: cart.items.reduce((s, i) => s + i.quantity, 0),
    items,
    prices: {
      subtotal_including_tax: money(total, cart.currency),
      grand_total: money(total, cart.currency),
    },
  };
}

/**
 * Fixture transport with the same signature as the HTTP transport.
 * @param {object} opts { store, currency, storage }
 */
export function createFixtureTransport({ store = 'fr', currency = 'EUR', storage } = {}) {
  const site = fixtureSiteOf(store);
  const box = storage || memoryStorage();
  const products = () => PRODUCTS[site].map((p) => withCurrency(p, currency));
  const categories = () => flatten(CATEGORIES[site]);

  const readCarts = () => {
    try {
      return JSON.parse(box.getItem(CARTS_KEY) || '{}');
    } catch (e) {
      return {};
    }
  };
  const writeCarts = (carts) => box.setItem(CARTS_KEY, JSON.stringify(carts));
  const noCart = (id) => ({
    data: null,
    errors: [{ message: `Could not find a cart with ID "${id}"`, extensions: { category: 'graphql-no-such-entity' } }],
  });

  const handlers = {
    ProductByUrlKey: ({ urlKey }) => ({
      data: { products: { items: products().filter((p) => p.url_key === urlKey) } },
    }),
    ProductBySku: ({ sku }) => ({
      data: { products: { items: products().filter((p) => p.sku === sku) } },
    }),
    CategoryByUrlPath: ({ urlPath }) => ({
      data: { categories: { items: categories().filter((c) => c.url_path === urlPath).map((c) => ({ ...c, description: `<p>Demo description of the ${c.name} category.</p>`, image: null })) } },
    }),
    ProductsByCategory: ({
      uid, pageSize, currentPage, sort,
    }) => {
      const cat = categories().find((c) => c.uid === uid);
      const inCat = cat ? products().filter((p) => p.categories.some((c) => c.url_path === cat.url_path || c.url_path.startsWith(`${cat.url_path}/`))) : [];
      return { data: { products: page(sortItems(inCat, sort), pageSize, currentPage) } };
    },
    ProductSearch: ({ search, pageSize, currentPage }) => {
      const q = String(search || '').toLowerCase().trim();
      const hits = q ? products().filter((p) => `${p.name} ${p.sku} ${p.short_description.html}`.toLowerCase().includes(q)) : [];
      return { data: { products: page(hits, pageSize, currentPage) } };
    },
    CategoryTree: () => ({
      data: {
        categoryList: [{
          uid: 'Uk9PVA==', name: 'Root', url_path: '', include_in_menu: 1, position: 0, children: clone(CATEGORIES[site]),
        }],
      },
    }),
    CreateGuestCart: () => {
      const carts = readCarts();
      const id = `demo-cart-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
      carts[id] = {
        id, store, currency, items: [],
      };
      writeCarts(carts);
      return { data: { createGuestCart: { cart: { id } } } };
    },
    AddProductsToCart: ({ cartId, items }) => {
      const carts = readCarts();
      const cart = carts[cartId];
      if (!cart) return noCart(cartId);
      const userErrors = [];
      (items || []).forEach((it) => {
        const product = products().find((p) => p.sku === it.sku);
        if (!product) {
          userErrors.push({ code: 'PRODUCT_NOT_FOUND', message: `Could not find a product with SKU "${it.sku}"` });
          return;
        }
        if (product.stock_status === 'OUT_OF_STOCK') {
          userErrors.push({ code: 'INSUFFICIENT_STOCK', message: 'Product that you are trying to add is not available.' });
          return;
        }
        const selected = it.selected_options || [];
        const options = (product.configurable_options || []).map((o) => {
          const v = o.values.find((val) => selected.includes(val.uid));
          return v ? { option_label: o.label, value_label: v.label } : null;
        }).filter(Boolean);
        const key = `${it.sku}|${selected.join(',')}`;
        const line = cart.items.find((l) => l.key === key);
        if (line) line.quantity += it.quantity;
        else {
          cart.items.push({
            key,
            uid: `item-${cart.items.length + 1}`,
            sku: product.sku,
            name: product.name,
            url_key: product.url_key,
            small_image: product.small_image,
            unit: product.price_range.minimum_price.final_price.value,
            quantity: it.quantity,
            options,
          });
        }
      });
      writeCarts(carts);
      return { data: { addProductsToCart: { cart: cartPayload(cart), user_errors: userErrors } } };
    },
    GetCart: ({ cartId }) => {
      const cart = readCarts()[cartId];
      return cart ? { data: { cart: cartPayload(cart) } } : noCart(cartId);
    },
  };

  return async function transport({ operationName, variables }) {
    const handler = handlers[operationName];
    if (!handler) return { data: null, errors: [{ message: `Fixture mode does not implement ${operationName}` }] };
    return clone(handler(variables || {}));
  };
}
