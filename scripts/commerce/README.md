# Commerce data module

This folder is the only code that talks to Adobe Commerce. Blocks import functions from `index.js` and never write GraphQL. When the backend moves from PaaS to Commerce as a Cloud Service or to API Mesh, the queries and `normalise.js` change and the blocks stay as they are.

Today the module targets the core GraphQL of Adobe Commerce PaaS 2.4.7. It does not use Catalog Service.

## Files

| File | Role |
|---|---|
| `index.js` | Public API. `createCommerce()` for tests, bound functions for blocks. |
| `queries.js` | GraphQL documents, each with its HTTP method. |
| `client.js` | HTTP transport: GET or POST, `Store` header, `CommerceError`. |
| `normalise.js` | Raw GraphQL payloads to the shapes below. |
| `fixtures.js` | Fixture transport used when no endpoint is configured. |

## Public API

All functions are async and use the store view of the current page (see `config/sites.json`).

| Function | GraphQL used | Method | Returns |
|---|---|---|---|
| `getProduct(urlKey)` | `products(filter: { url_key: { eq } })` | GET | `Product` or `null` |
| `listCategory(urlPath, { page, pageSize, sort })` | `categories(filters: { url_path: { eq } })`, then `products(filter: { category_uid: { eq } })` | GET, GET | `CategoryPage` or `null` |
| `search(term, { page, pageSize })` | `products(search:)` | GET | `SearchPage` |
| `getCategoryTree()` | `categoryList` | GET | `CategoryNode[]` |
| `cart.create()` | `createGuestCart` | POST | cart id (string) |
| `cart.add(sku, qty, { selectedOptions })` | `addProductsToCart` | POST | `Cart` |
| `cart.get()` | `cart(cart_id:)` | POST | `Cart` (empty cart when none) |
| `cart.clear()` | none, forgets the local cart id | | |
| `getMode()` | none | | `'live'` or `'fixture'` |

`sort` accepts `position` (default), `name`, `price_asc` and `price_desc`. Blocks hide the price sorts on views that do not sell.

Only GET requests are cacheable by Commerce and Fastly, so every catalogue read uses GET. Mutations use POST. The cart query also uses POST because a cart is private and must never land in a shared cache.

The cart id is kept in `localStorage` under `commerce-cart:<store code>`. When Commerce no longer knows the id, `cart.get()` returns an empty cart and `cart.add()` creates a new cart and retries once. After each change the module fires a `commerce:cart` event on `window` with the new `Cart` (the header mini cart listens to it).

Errors are thrown as `CommerceError` with a `code`. Codes include `GRAPHQL_ERROR`, `HTTP_ERROR`, `NETWORK_ERROR`, `INVALID_INPUT`, `CART_ERROR` and the `user_errors` codes of `addProductsToCart` (for example `PRODUCT_NOT_FOUND` or `INSUFFICIENT_STOCK`).

## Shapes

These shapes are the contract. Keep them stable and add fields rather than rename them.

```text
Money        { value: number, currency: string }
Price        { regular: Money, final: Money, discounted: boolean }
Image        { url: string, label: string }

ProductSummary {
  id, sku, name, urlKey, type,          // type: simple | configurable | bundle | ...
  inStock: boolean,
  image: Image | null,
  shortDescription: string (HTML),
  price: Price | null
}

Product = ProductSummary + {
  description: string (HTML),
  metaTitle, metaDescription,
  images: Image[],                      // media gallery, sorted, disabled entries removed
  attributes: { [code]: string },       // custom_attributesV2, option labels joined
  options: [{ id, code, label, values: [{ id, label }] }],   // configurable options
  categories: [{ id, name, urlPath }],
  breadcrumbs: [{ name, urlPath }]      // from the deepest category
}

Category     { id, name, urlPath, description (HTML), image: Image | null,
               metaTitle, metaDescription, breadcrumbs: [{ name, urlPath }] }
PageInfo     { current, size, totalPages, totalCount }
CategoryPage { category: Category, sort, items: ProductSummary[], page: PageInfo }
SearchPage   { term, items: ProductSummary[], page: PageInfo }
CategoryNode { id, name, urlPath, position, children: CategoryNode[] }   // include_in_menu only
CartItem     { id, sku, name, urlKey, image, quantity, options: [{ label, value }], rowTotal: Money }
Cart         { id, totalQuantity, items: CartItem[], subtotal: Money | null, grandTotal: Money | null }
```

The HTML fields come from the Commerce admin. Blocks pass them through `sanitizeHtml()` in `scripts/product-ui.js` before inserting them.

## Fixture mode

When `commerce-endpoint` is empty, the module answers from `fixtures.js`. The fixture transport returns the same raw GraphQL payloads as Commerce, so the normalisation code runs the same way in both modes. The data is fake on purpose: names like "Demo serum A", skus `DEMO-001` to `DEMO-008` and `DEMO-W01` to `DEMO-W03`, example prices and placeholder SVG images under `/images/demo/`. Store codes starting with `wellbox_` get the Wellbox catalogue, every other code gets the LPG one. The fixture cart lives in `localStorage` (or memory under Node).

## Assumptions to check against the sandbox

These points come from the Adobe Commerce 2.4.7 schema as documented, not from the LPG instance, which does not exist yet.

- `custom_attributesV2` exists on `ProductInterface` from 2.4.7. If a module removes it, the product query fails as a whole.
- The PDP tab attribute codes (`application`, `ingredients`, `results`) are placeholders in `config/sites.json` under `productAttributes`. The real LPG codes are unknown.
- `categoryList` without filters returns the root category of the store view. The menu is its children.
- `createGuestCart` is the 2.4.7 mutation. Older instances only have `createEmptyCart`.

## Moving to SaaS later

Commerce as a Cloud Service and Catalog Service expose different queries (`productSearch`, `products(skus:)`, `categories` on Catalog Service). The switch means new documents in `queries.js`, new mapping functions in `normalise.js` that produce the same shapes, and the tests in `test/commerce.test.js` updated with SaaS payloads. Blocks should need no change.
