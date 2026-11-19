# Commerce data module

This folder is the only code that talks to Adobe Commerce. Blocks import functions from `index.js` and never write GraphQL. When a backend changes, the queries and the normalisers change and the blocks stay as they are.

The module has two clients, the same split as the Adobe commerce boilerplate (`scripts/commerce.js`, catalogue client on `commerce-endpoint`, core client on `commerce-core-endpoint`):

| Client | Serves | Backend | Endpoint key |
|---|---|---|---|
| Catalogue | `getProduct`, `listCategory`, `search`, `getCategoryTree` | `aco` (Commerce Optimizer Merchandising GraphQL), `paas-core` (PaaS core GraphQL) or `fixture` | `commerce-endpoint` for `aco`, `commerce-core-endpoint` for `paas-core` |
| Core | `cart.*`, the price book id, later account and checkout | Always the PaaS core GraphQL of `lpg-migration`, header `Store` | `commerce-core-endpoint` |

## Files

| File | Role |
|---|---|
| `index.js` | Public API. `createCommerce()` for tests, bound functions for blocks. Picks the backend and routes calls. |
| `client.js` | HTTP transport (GET or POST, `Store` header on PaaS only, extra headers per request), `createRunner`, `CommerceError`. |
| `queries.js`, `normalise.js` | PaaS core GraphQL documents and their mapping to the shapes below. |
| `aco.js` | ACO catalogue client: headers, price book fallback, variant lookup. |
| `aco-queries.js`, `aco-normalise.js` | ACO Merchandising GraphQL documents and their mapping to the same shapes. |
| `price-book.js` | `commerceOptimizer { priceBookId }` on PaaS, cached per session and store view. |
| `fixtures.js` | Fixture transport used when no backend is configured. |

## Choosing the backend

Everything lives in `config/sites.json`. Keys are read from the locale entry, then the site entry, then the top level.

| Key | Meaning |
|---|---|
| `catalog-backend` | `aco`, `paas-core` or `fixture`. When it is missing: `paas-core` if `commerce-endpoint` is set, `fixture` otherwise. |
| `commerce-endpoint` | Catalogue URL. For `aco` it is `https://na1-sandbox.api.commerce.adobe.com/QD1T4hbz1zGxLHYpp8cyPy/graphql`. |
| `commerce-core-endpoint` | PaaS core GraphQL. Set per site: the main host for LPG, the `wellbox.` host for Wellbox. |
| `aco.viewId` | Catalogue view id from Optimizer Studio, sent as `AC-View-ID`. Required. |
| `aco.priceBookId` | Base price book of the website (`lpg_group`, `wellbox`). Used as the fallback. |
| `aco.locale` | Optional. Sent as `AC-Scope-Locale`. Leave it out unless a view holds several sources. |
| `aco.policies` | Optional `{ "Name": "value" }`, sent as `AC-Policy-Name: value`. |
| `aco.taxRate` | Optional. ACO prices are excluding tax. A view that displays prices including tax sets the rate (`0.2` for French VAT) and the client adds it, rounded to the cent. |

The four catalogue views were created in Optimizer Studio on 19 November 2026.

| Store view | Studio name | `aco.viewId` |
|---|---|---|
| `fr` | LPG lab LPG FR | `3b06919b-2447-4d9b-9426-13cb72d40689` |
| `en` | LPG lab LPG EN | `97ebb532-021d-419b-af10-6507acb2626e` |
| `wellbox_fr` | LPG lab Wellbox FR | `8aabd439-f2ab-4d91-a9b1-548fe45b389e` |
| `wellbox_en` | LPG lab Wellbox EN | `71f025e3-6691-4141-8d92-a380017eece3` |

The committed value is still `"catalog-backend": "fixture"`, so a shared `*.aem.page` preview keeps running on demo data. To try ACO on a dev host, use the `localStorage` overrides below. To switch for good, set the top-level `"catalog-backend"` to `"aco"`. A placeholder view id that starts with `TODO` makes every catalogue call fail with `CONFIG_ERROR`, on purpose.

The `taxRate` of `0.2` was checked against PaaS on six Wellbox SKUs on 19 November 2026. The PaaS price including tax divided by the ACO price was 1.2 every time, give or take the rounding to the cent. One rate per view is an approximation. It ignores product tax classes and the customer address.

A locale without an `aco.viewId` key is not exported to ACO (es, it, de, nl, us, pro_fr, pro_en today). When the backend is `aco` these views use `paas-core` on their `commerce-core-endpoint`. They never send PaaS queries to the ACO URL.

On dev hosts three `localStorage` keys override the file: `catalog-backend`, `commerce-endpoint` and `commerce-core-endpoint`. Setting only `commerce-endpoint` with no backend keeps the old behaviour (live PaaS through that URL).

## Headers

| Header | Sent to | Value |
|---|---|---|
| `Store` | PaaS only | Store view code (`fr`, `wellbox_fr`, ...) |
| `AC-View-ID` | ACO only | `aco.viewId`. Required by the Merchandising API |
| `AC-Price-Book-ID` | ACO only | Session price book, or the base one (see below) |
| `AC-Scope-Locale` | ACO, only when `aco.locale` is set | Source locale |
| `AC-Policy-*` | ACO, only when `aco.policies` is set | Policy trigger values |

The Merchandising API needs no secret for a public catalogue view. Adobe documents "Authentication is not required for the Merchandising API by default". A private view needs a JWT signed with an RSA private key in `AC-Catalog-View-Access-Token`. That key cannot live in browser code, so private views are not supported here.

`AC-Source-Locale` is not in the current header reference. The sandbox error messages name `AC-Scope-Locale` and `Magento-Store-View-Code` when a request cannot resolve a locale, which is why the optional header is `AC-Scope-Locale`.

## Price book

Before a priced ACO request on a view that sells, the module asks PaaS `commerceOptimizer { priceBookId }` (POST, never cached by a CDN). The answer is kept in `sessionStorage` under `commerce-pricebook:<store>` and sent as `AC-Price-Book-ID`. When PaaS fails or returns nothing, the module sends `aco.priceBookId` and tries again on the next page. Views that do not sell (`fr`, `en`) skip the PaaS call and send the base book. `resetPriceBook()` forgets the cached value. Sign in and sign out must call it once they exist.

Observed on 19 November 2026: the guest book `wellbox::sha1(0)` only holds the prices that differ for the group (catalogue rule discounts). Simple products without a discount have no price there, only in the base book `wellbox`. The module therefore re-reads the SKUs that came back without a price from the base book (one extra `products(skus:)` query) and merges them. Products that still have no price show none.

## Public API

All functions are async and use the store view of the current page.

| Function | `paas-core` / fixture | `aco` | Returns |
|---|---|---|---|
| `getProduct(urlKey, { sku })` | `products(filter: { url_key })`, or `{ sku }` when only the sku is given | `productSearch(filter: url_key)`, or `products(skus:)` when the sku is given | `Product` or `null` |
| `listCategory(urlPath, { page, pageSize, sort })` | `categories(filters: { url_path })`, then `products(filter: { category_uid })` | `categoryTree(slugs: [ancestors, slug])`, then `productSearch(filter: categoryPath)` | `CategoryPage` or `null` |
| `search(term, { page, pageSize })` | `products(search:)` | `productSearch(phrase:)` | `SearchPage` |
| `getCategoryTree()` | `categoryList` | `navigation(family: "top_menu")` | `CategoryNode[]` |
| `cart.create()` | `createGuestCart` on PaaS | same | cart id |
| `cart.add(sku, qty, { selectedOptions })` | `addProductsToCart` on PaaS | same | `Cart` |
| `cart.get()`, `cart.clear()` | `cart(cart_id:)` on PaaS | same | `Cart` |
| `getMode()`, `getBackend()` | | | `'live'` or `'fixture'`, and the backend name |
| `resetPriceBook()` | no effect | clears the cached price book id | |

ACO catalogue reads use GET (the sandbox accepts GET and its CORS answer allows `content-type`, `ac-view-id` and `ac-price-book-id` from `http://localhost:3000`). Mutations, the cart and the price book use POST.

`sort` accepts `position` (default), `name`, `price_asc` and `price_desc`. On ACO they map to `productSearch(sort:)` on `position`, `name` and `price`, the sortable attributes the sandbox reports.

### Add to cart from an ACO product

For a configurable product the block sends the parent sku and the option value ids. The connector exports the Magento option uids as ACO option value ids. On the sandbox, `wellbox-2` returns `Y29uZmlndXJhYmxlLzkzLzEz` from ACO and the same uid from PaaS `configurable_options` (base64 of `configurable/93/13`). The module therefore sends `{ sku: parent, selected_options: [uid] }`, which PaaS accepts. If option ids ever stop being Magento uids, the module asks ACO `refineProduct(sku, optionIds)` for the simple sku and sends `{ sku: child, parent_sku: parent }` instead.

Bundles are not handled. The connector expects `base64("bundle_item/" + JSON.stringify({ sku, qty }))` per selected option, and no LPG bundle has been seen yet.

Errors are thrown as `CommerceError` with a `code`. Codes include `CONFIG_ERROR`, `GRAPHQL_ERROR`, `HTTP_ERROR`, `NETWORK_ERROR`, `INVALID_INPUT`, `CART_ERROR` and the `user_errors` codes of `addProductsToCart` (for example `PRODUCT_NOT_FOUND` or `INSUFFICIENT_STOCK`).

The cart id is kept in `localStorage` under `commerce-cart:<store code>`. When Commerce no longer knows the id, `cart.get()` returns an empty cart and `cart.add()` creates a new cart and retries once. After each change the module fires a `commerce:cart` event on `window` with the new `Cart`.

## Shapes

These shapes are the contract. Keep them stable and add fields rather than rename them.

```text
Money        { value: number, currency: string }
Price        { regular: Money, final: Money, discounted: boolean }
Image        { url: string, label: string }

ProductSummary {
  id, sku, name, urlKey, type,          // type: simple | configurable | bundle | complex | ...
  inStock: boolean,
  image: Image | null,
  shortDescription: string (HTML),
  price: Price | null
}

Product = ProductSummary + {
  description: string (HTML),
  metaTitle, metaDescription,
  images: Image[],                      // media gallery, sorted, disabled entries removed
  attributes: { [code]: string },       // custom_attributesV2 or ACO attributes, lists joined
  options: [{ id, code, label, values: [{ id, label }] }],   // configurable options
  categories: [{ id, name, urlPath }],
  breadcrumbs: [{ name, urlPath }]      // from the deepest category
}

Category     { id, name, urlPath, description (HTML), image: Image | null,
               metaTitle, metaDescription, breadcrumbs: [{ name, urlPath }] }
PageInfo     { current, size, totalPages, totalCount }
CategoryPage { category: Category, sort, items: ProductSummary[], page: PageInfo }
SearchPage   { term, items: ProductSummary[], page: PageInfo }
CategoryNode { id, name, urlPath, position, children: CategoryNode[] }   // menu entries only
CartItem     { id, sku, name, urlKey, image, quantity, options: [{ label, value }],
               unitPrice, unitPriceInclTax, rowTotal, rowTotalInclTax: Money | null }
Cart         { id, totalQuantity, items: CartItem[], subtotal: Money | null, grandTotal: Money | null }
```

How ACO fields map:

| Shape field | ACO source |
|---|---|
| `id` | `ProductView.id` (composite key, unique per locale) |
| `urlKey` | `urlKey` |
| `type` | `simple` for `SimpleProductView`. For `ComplexProductView`, read from the first option value uid (`configurable`, `bundle`), `complex` otherwise |
| `inStock` | Complex: true when one option value has `inStock`. Simple: always true, the live schema no longer exposes `inStock` on products. PaaS still refuses out of stock items at add to cart |
| `image` | Image with role `small_image`, then `image`, then the first one |
| `price` | `price` (simple) or `priceRange.minimum` (complex). `null` when roles contain `hidden` |
| `attributes` | `attributes[].name` to `value` (strings, numbers and lists. Objects are skipped) |
| `options` | `options[].id` (the attribute code), `title`, `values[].id`, `values[].title` |
| `categories`, `urlPath` | Category `slug`, which is the Magento `url_path` |
| `breadcrumbs` | Deepest category: its `parents` then itself |
| `CategoryNode.position` | Order returned by `navigation` |

The HTML fields come from the Commerce admin. Blocks pass them through `sanitizeHtml()` in `scripts/product-ui.js` before inserting them.

## Fixture mode

When the backend is `fixture` (the committed default) or no catalogue URL is set, the module answers from `fixtures.js`. The fixture transport returns PaaS-shaped raw payloads, so `normalise.js` runs the same way. The data is fake on purpose: names like "Demo serum A", skus `DEMO-001` to `DEMO-008` and `DEMO-W01` to `DEMO-W03`, example prices and placeholder SVG images under `/images/demo/`. Store codes starting with `wellbox_` get the Wellbox catalogue, every other code gets the LPG one.

## Known gaps and assumptions

Facts observed on the sandbox on 19 November 2026 are marked as such. The rest is inference.

- Observed: ACO prices are tax excluded (41.71 for a product PaaS shows at 44.00 incl. VAT, 1,165.83 for 1,399.00). Wellbox shows prices "TTC". Until ACO or the connector provides display prices with tax, the ACO prices on Wellbox are wrong for French shoppers. This needs a decision before the Wellbox switch.
- Observed: LPG `fr` and `en` have no categories in ACO, so `getCategoryTree()` returns an empty list there and the header uses `fallbackNav`. `listCategory` on LPG paths returns `null`.
- Inference: `aco.locale` is not needed when a view has a single source. To check with the first real view id.
- `getProduct` by url key relies on `url_key` being filterable in `productSearch`. It is on the Wellbox sandbox data. The sku route (`products(skus:)`) has no such dependency.
- The PaaS core endpoint sends no CORS headers for `http://localhost:3000` (preflight answered 204 without `Access-Control-Allow-Origin`). In the browser the price book call fails and the base book is used, and the cart needs the dev proxy (`commerce-core-endpoint` override set to `http://localhost:3001/graphql`).
