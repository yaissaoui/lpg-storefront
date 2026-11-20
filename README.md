# LPG storefront on Edge Delivery Services (lab)

EDS storefront for the LPG migration lab. One code base serves two sites: the institutional LPG catalogue and the Wellbox shop. Commerce features use the Adobe drop-ins, wired like the Adobe commerce boilerplate (`hlxsites/aem-boilerplate-commerce`). The drop-ins are pinned to Adobe's June 2026 release, the one tested with the Compatibility Package installed on the sandbox (see "Drop-in versions"). The catalogue comes from Adobe Commerce Optimizer (ACO). The cart runs on the PaaS 2.4.7 core GraphQL of the sandbox `lpg-migration`. The plan behind it is in `../docs/PLAN.en.md`, sections 4 and 6.

The code started from `adobe/aem-boilerplate` (Apache-2.0, commit `599a356`). `scripts/aem.js` is vendored from it and must not be edited. The drop-ins are vendored in `scripts/__dropins__` and must not be edited either.

Any document or screenshot from this repository that goes to the client needs a human review first.

## Rules that apply here

- Drop-ins are allowed because the lab uses Commerce Optimizer, whose licence covers them (decision of 20 November 2026, `../docs/ACO-PAAS.md` section 11). Production needs the client's own ACO licence.
- Drop-ins are used as Adobe ships them. Code under `scripts/__dropins__` is never edited and we write no work-around over drop-in behaviour. Our own code is LPG business logic (VAT display, showcase mode), done with slots, events and model transformers, and later App Builder modules.
- No real customer data. Drafts point at sandbox products only.
- The repository `yaissaoui/lpg-storefront` is public since 20 November 2026 (internal demo). It still holds LPG brand assets and the General Sans fonts, see "Styles and fonts".

## Run it locally

Everything runs in the lab container (`make up` from the repository root starts it).

```sh
docker exec -d -w /workspace/storefront lpg-dev-toolchain-1 \
  sh -c 'aem up --no-open --addr "*" --html-folder drafts --html-mount / > /tmp/aem.log 2>&1'
```

Then open <http://localhost:3000/wellbox/fr/products/wellbox-2-wellbox-2>.

`--html-mount /` matters. Without it the CLI serves the drafts under `/drafts/...` and the store root (`/wellbox/fr/`) is not found.

Install, copy the drop-ins, check:

```sh
docker exec -u "$(id -u):$(id -g)" -e HOME=/tmp/h -w /workspace/storefront lpg-dev-toolchain-1 \
  sh -c 'npm ci && npm run install:dropins && npm run lint && npm test'
```

`.npmrc` sets `ignore-scripts=true` like the boilerplate, so `npm ci` does not run the postinstall step. `npm run install:dropins` runs `build.mjs` (GraphQL fragment overrides, none today) and `postinstall.js`, which copies the `@dropins/*` packages listed in `dependencies` to `scripts/__dropins__`. That folder is committed. Source maps are neither committed (`.gitignore`) nor served (`.hlxignore`). After a version change, run the script and commit the folder.

The `-u` flag is there because the container user is uid 1000 and the files on the host may belong to another uid.

### Pages to try

| URL | What it shows |
|---|---|
| `/wellbox/fr/products/wellbox-2-wellbox-2` | PDP: gallery, colour options, price per variant including VAT, quantity, add to cart |
| `/wellbox/fr/accessoires-wellbox`, `/wellbox/fr/cosmetiques`, `/wellbox/fr/wellbox-produits` | PLP with sort and pagination |
| `/wellbox/fr/search?q=tete` | Search results |
| `/wellbox/fr/cart` | Cart page (local draft only, see "Not done yet") |
| `/fr/products/the-bio-minceur-express-j14-102359502` | LPG showcase PDP: no price, "Trouver un centre" and the pro shop link (local draft) |
| `/fr/search?q=creme` | LPG showcase search: no price, "Découvrir" |

The 63 Wellbox product pages, the three Wellbox category pages and the search pages exist in DA.live (`https://da.live/#/yaissaoui/lpg-storefront`). Code Sync publishes each branch at `https://{branch}--lpg-storefront--yaissaoui.aem.page/`.

## Drop-in versions

The sandbox `lpg-migration` runs Adobe Commerce 2.4.7-p10 with the Storefront Compatibility Package 4.7.13. It cannot go higher: with our Composer keys, repo.magento.com lists 4.7.0 to 4.7.13 and 4.8.0 to 4.8.8 only. Adobe publishes 4.7.14 to 4.7.20 for merchants with an ACO licence, and our keys do not see them.

The drop-in release tested with 4.7.13 on Commerce 2.4.7 is the June 2026 suite (source below). Newer drop-ins query GraphQL fields that 4.7.13 does not add. For example `storefront-cart` 3.4.1 selects `Cart.has_available_free_gifts`, `CartItemInterface.is_free_gift` and `CartItemInterface.is_salable`, and the sandbox rejected every cart call. The 3.3.x cart tarballs do not reference these fields. So this storefront pins the June suite, taking the latest patch on npm within each range:

| Package | June 2026 range | Pinned |
|---|---|---|
| `@dropins/tools` (Drop-in SDK) | 1.9.x | 1.9.0 |
| `@dropins/storefront-auth` | ~4.0.0 | 4.0.1 |
| `@dropins/storefront-cart` | ~3.3.0 | 3.3.1 |
| `@dropins/storefront-pdp` | ~3.2.0 | 3.2.0 |
| `@dropins/storefront-product-discovery` | ~3.1.1 | 3.1.3 |
| `@dropins/storefront-checkout` | ~3.3.0 | 3.3.1 |
| `@dropins/storefront-order` | ~4.0.0 | 4.0.1 |
| `@dropins/storefront-account` | ~4.0.0 | 4.0.0 |
| `@dropins/build-tools` (dev) | boilerplate of June 2026 | 1.2.0 |

The suite also lists payment-services ~3.1.2 (LPG does not use it), recommendations ~4.0.4 and wishlist ~3.3.0, which this lab does not use.

Every GraphQL operation shipped in the vendored drop-ins can be checked against the sandbox schema with `node tools/validate-dropin-graphql.mjs scripts/__dropins__ <core endpoint> wellbox_fr storefront-cart storefront-auth storefront-checkout storefront-order storefront-account`. The script appends an unused fragment so the server rejects each document at validation time and never executes it, mutations included. Results on 20 November 2026 are in "Known issues" (K1).

These versions come with some caveats:

- `storefront-auth` 4.0.1 and `storefront-cart` 3.3.1 were published on 29 July 2026, and `storefront-product-discovery` 3.1.2 and 3.1.3 in September and October. The boilerplate shipped them next to `@dropins/tools` 2.x and 3.x. They are patch releases inside the June ranges. Every import they make from `@dropins/tools` exists in 1.9.0 (checked by script), and the pages below work with them. If one misbehaves, the exact June builds are auth 4.0.0, cart 3.3.0 and product-discovery 3.1.1.
- The project code (`scripts/commerce.js`, `scripts/initializers/`, the commerce blocks, `head.html`) follows the boilerplate as it was on 11 June 2026 (commit `f00f929e`, "bump all drop-in packages to stable"). Two exceptions: no free-gift flag on the cart initializer, and the module preloads that tools 1.9.0 actually ships.

To move to the latest suite once Compatibility Package 4.7.14 or later is installable (ACO licence keys on repo.magento.com):

1. Install the package on the PaaS (`composer require` of the Storefront Compatibility Package in the lpg-ops overlay), deploy it to `lpg-migration` and check that the cart query of the target cart version validates. Run `CART_FRAGMENT` from `scripts/__dropins__/storefront-cart/fragments.js` against `/graphql` with a guest cart id.
2. Read the release notes of the target suite on the Adobe storefront releases page and copy its versions into `package.json`. Copy `build.mjs` from the boilerplate commit of that release.
3. Run `npm install` then `npm run install:dropins` in the container, and commit `scripts/__dropins__`.
4. Diff `scripts/commerce.js`, `scripts/initializers/*`, `head.html` and the commerce blocks against the boilerplate at that release (`git log --until=<release date>` in a clone) and port the API changes. For example, recent releases add `features.isFreeGiftsCartPriceRulesEnabled` to the cart initializer and a `commerce/customer-context` event.
5. Re-run `tools/validate-dropin-graphql.mjs` and the checks of "Known issues". Some of them are fixed in later suites. For example `storefront-pdp` 3.4.0 renders the product name as an `h1`, which 3.2.0 does not.
6. Run `npm run lint`, `npm test` and the pages of "Pages to try" on local and on the branch preview.

## Structure

```text
blocks/
  header/          logo, category menu (ACO navigation), search box, account, drop-in MiniCart
  footer/          4 columns from the {locale}/footer fragment, language switcher
  product-details/ PDP on storefront-pdp, showcase mode on views that do not sell
  product-list/    PLP on storefront-product-discovery, variant compact for related products
  search/          search results on storefront-product-discovery
  commerce-cart/   cart page on storefront-cart
  hero/ cards/ teaser/ testimonials/ columns/ fragment/ widget/   content blocks
config/
  site-config.public.json  boilerplate "public" config: endpoints, Store header, ACO view and price book
  sites.json               presentation: theme, logo, menu fallback, selling or showcase mode, tax display
scripts/
  scripts.js       boilerplate loader, initialises commerce, sets body.site-lpg or body.site-wellbox
  commerce.js      the two GraphQL clients, config loading, sku resolution, placeholders
  commerce-utils.js pure helpers: VAT and price transformers, product path, config fallback, cart field filter
  initializers/    auth, cart, pdp, search (one per drop-in, like the boilerplate)
  product-discovery.js shared PLP and search rendering
  site-config.js   site and locale resolution (pure functions, tested)
  __dropins__/     vendored drop-ins, never edited
placeholders/      drop-in labels, fr and en (fallback while DA holds none)
styles/            styles.css (themes and drop-in design tokens), product-discovery.css, fonts.css
drafts/            local content as .plain.html files (ignored by .hlxignore)
test/              node:test unit tests
```

## Universal Editor

The project is instrumented for the Universal Editor on DA content (`*.ue.da.live`), following `aemsites/da-block-collection` and the DA documentation (sources below):

- `ue/models/` holds the sources: `page.json` (page metadata model), `section.json` (section styles, column width and gap, and the list of blocks a section accepts), `text.json`, `image.json`, and one file per block in `ue/models/blocks/`. Content blocks (hero, cards with card, teaser with teaser-item, testimonials with testimonial, columns, fragment) have field selectors. Product and commerce blocks are key-value blocks when they have options (`product-details`, `product-list`, `search`, `commerce-cart`, `commerce-orders-list`, `commerce-addresses`, `commerce-account-header`), and empty one-cell blocks otherwise, taken from the boilerplate `_*.json` files.
- `npm run build:json` merges them into `component-definition.json`, `component-models.json` and `component-filters.json` at the root. These three files are committed. Run the script after every change in `ue/models` (no husky hook here). `test/ue-models.test.js` fails when a block has no definition, a definition has no model, a section does not accept a block, or the root files are stale.
- `scripts/scripts.js` imports `ue/scripts/ue.js` only when the host is `*.ue.da.live`. It moves the `data-aue-*` attributes when cards and testimonials rebuild their rows into `ul > li`, and refreshes images after an edit.
- `decorateSections` treats the `richtext` wrappers of the UE markup as default content (UE used to request `blocks/richtext/richtext.js`). It also applies section metadata left in the markup. A small `metadata` block shows the page metadata table inside UE and hides it elsewhere (UE used to request `blocks/metadata/metadata.js`).
- `scripts/aem.js` is not edited.

UE can now select every block. Selections showed "Failed to fetch details" because the three root files answered 404.

## Customer, checkout and order pages

The blocks come from the boilerplate as it was on 11 June 2026 and use storefront-auth, storefront-account, storefront-checkout and storefront-order. Paths sit under the store root, built with `rootLink()` like the boilerplate: `/wellbox/fr/...` on Wellbox (aem.page) and `/fr/...` on LPG, where the header button says "Espace Pro".

| Path | Blocks |
|---|---|
| `/customer/login` | commerce-login |
| `/customer/create` | commerce-create-account |
| `/customer/forgotpassword` | commerce-forgot-password |
| `/customer/createPassword` | commerce-create-password (link of the reset e-mail) |
| `/customer/confirm-account` | commerce-confirm-account (link of the confirmation e-mail) |
| `/customer/account` | sidebar, account-header, orders-list and addresses (minified), customer-information |
| `/customer/address` | sidebar, addresses |
| `/customer/orders` | sidebar, orders-list |
| `/customer/order-details` | sidebar, order-header, order-status, shipping-status, customer-details, order-cost-summary, order-product-list, order-comments |
| `/customer/sidebar-fragment` | fragment read by the sidebar (title, subtitle, path, icon per item) |
| `/order-details` | the same order blocks for a guest order (`?orderRef=`) |
| `/order-status` | commerce-search-order (guest order search) |
| `/checkout` | commerce-checkout, then the order confirmation from commerce-checkout-success |
| `/cart` | commerce-cart (Wellbox) |

`drafts/` holds one `.plain.html` per page and site, in DA markup: the block table, `section-metadata` for the column width and gap of the account pages, and a `metadata` table (title, `Template: My Account, Columns` on account pages, `Robots: noindex, nofollow`). Upload them to DA under the same paths. `/checkout` and `/cart` exist for Wellbox only.

Changes from the boilerplate blocks:
- No Payment Services. `PaymentMethods` lists the methods the PaaS returns.
- The checkout agreements come from the PaaS (`CGV Wellbox FR`, manual consent). The boilerplate's extra "default" agreement is not added.
- The order initializer compares paths with `rootLink()`, because the boilerplate compares `/order-details` with the full path and never matches under a store root.
- Visible strings that the boilerplate hardcodes in English (welcome messages, "Continue shopping", "Need help?", checkout title, order search labels) come from `placeholders/{lang}/global.json`.
- The header uses the boilerplate auth dropdown pattern: signed out, a panel with `SignIn`. Signed in, links to the account and to sign out. The mini cart "Commander" button goes to `/checkout`, and the header shows no mini cart on the checkout page.

Facts read from the sandbox on 20 November 2026 (`Store: wellbox_fr`, scripts in the PR description):
- `is_guest_checkout_enabled` is false on `wellbox_fr` and `fr`. Shoppers must sign in or create an account before checkout, and guest mutations answer "Guest checkout is not allowed".
- Shipping to 75001 Paris FR (`estimateShippingMethods`): `upsstandard` "Livraison Standard en 48h à 72h", 9,90 € TTC (8,25 HT), and `upsexpress` "Livraison Express en 24h à 48h", 13,20 € TTC (11,00 HT).
- `available_payment_methods` on a cart: 130 Adyen methods (`adyen_cc` "Carte bancaire", `adyen_paypal`, `adyen_applepay`, ...), all deferred, and no offline method (`checkmo`, `banktransfer`, `free`). Adyen methods need the Adyen web components to collect payment data, and those are not part of the drop-ins. An order can therefore not be paid on this storefront until an offline method is enabled on the sandbox, or the Adyen integration is built (see "Known issues", K2).
- `checkoutAgreements`: one manual agreement, "CGV Wellbox FR".

## Sites and locales

The site comes from the hostname. A host containing `wellbox` selects Wellbox, anything else selects LPG. On dev hosts (`localhost`, `127.0.0.1`, `*.aem.page`) three overrides apply, in this order: `?site=<key>` (kept in `localStorage`), the site's `devPathPrefix` (`/wellbox/...`), then the stored value. Production hosts ignore them. The locale is the first path segment after that prefix.

| Site | Folder | Store view | Sells | ACO view |
|---|---|---|---|---|
| lpg | `fr`, `en` | same code | no | yes |
| lpg | `es`, `it`, `de`, `nl`, `us` | same code | no | no, falls back to the default (LPG fr) |
| lpg | `pro-fr`, `pro-en` | `pro_fr`, `pro_en` | yes | no |
| wellbox | `fr`, `en` | `wellbox_fr`, `wellbox_en` | yes | yes |

`sells` in `config/sites.json` decides whether prices, quantity, add to cart and the mini cart appear. On 19 Nov 2026 the institutional LPG site showed no price and no cart, while Wellbox showed prices and a black "Ajouter au panier" button.

## Commerce with the drop-ins

### Configuration

`config/site-config.public.json` has the shape the boilerplate reads from `/config.json`: a `public` object with a `default` entry and one entry per store root (`/fr/`, `/en/`, `/wellbox/fr/`, `/wellbox/en/`). Each holds `commerce-endpoint` (ACO), `commerce-core-endpoint` (PaaS), `adobe-commerce-optimizer: true`, `headers.all.Store` and `headers.cs` with `AC-View-ID` and `AC-Price-Book-ID`. The drop-in resolver (`@dropins/tools/lib/aem/configs.js`) picks the longest matching root and merges it over `default`. Only keys the boilerplate uses are present, and a test checks it.

`scripts/commerce.js` fetches `/config.json` first. On 20 November 2026 that URL answers 404 on `*.aem.page`, because the configuration service of the site holds no `public` section and this lab has no write access to it. The script then reads the committed `/config/site-config.public.json`. Once someone puts the same JSON in the config service, the fallback is no longer used and can be deleted. The result is cached in `sessionStorage` for two hours, like the boilerplate.

On aem.page Wellbox lives under `/wellbox/fr/`. On a future Wellbox host it would live under `/fr/`, which the LPG entry also matches. Two aem.live sites (one per host) with their own config each solve that. The resolver also accepts a custom `match` function if one site must serve both.

`config/sites.json` keeps the presentation settings only (theme, logo, menu fallback, `sells`, `taxRate`).

### Clients and headers

| Client | Endpoint | Headers | Used by |
|---|---|---|---|
| `CS_FETCH_GRAPHQL` | ACO Merchandising GraphQL, `?cb=` hash of the headers | `AC-View-ID`, `AC-Price-Book-ID`, `Store` | storefront-pdp, storefront-product-discovery, menu, category heading, sku lookup |
| `CORE_FETCH_GRAPHQL` | PaaS core GraphQL of the site (main host or `wellbox.` host) | `Store` | storefront-auth, storefront-cart |

The auth drop-in runs with `adobeCommerceOptimizer: true`. It reads `commerceOptimizer { priceBookId }` from PaaS (the guest book `wellbox::b6589f…` on Wellbox) and the initializer sets it as `AC-Price-Book-ID`. Until then the base book from the config (`wellbox`, `lpg_group`) applies.

The boilerplate also copies `AC-View-ID` and `AC-Price-Book-ID` onto core requests (for ACCS in CCDM mode). The PaaS sandbox does not need them and its CORS answer does not allow them, so this lab leaves that hook out.

### Product URLs and sku

The boilerplate expects `/products/{urlKey}/{sku}` or `<meta name="sku">`. The DA pages of this lab sit at `/wellbox/fr/products/{urlKey}` with an empty `product-details` block. `scripts/commerce.js` reads the sku in this order: `<meta name="sku">`, then a sku segment after the url key, then one ACO query `productSearch(filter: url_key)` cached per view in `sessionStorage`. Product links built by the drop-ins (`getProductLink`) keep `/products/{urlKey}` so they land on the existing pages. The extra query costs one round trip on the first visit of a product. When BYOM or JSON2HTML renders product pages, it should write `<meta name="sku">` and the lookup stops.

### VAT and price visibility

ACO prices exclude tax. Wellbox shows prices including 20 % VAT (999.00 TTC for WELLBOX 2 white, 832.50 in ACO). Each view that shows tax sets `taxRate` in `config/sites.json` (0.2 on `wellbox_fr` and `wellbox_en`, nothing elsewhere). The pdp and search initializers pass a model transformer (`models.ProductDetails.transformer`, `models.Product.transformer`). Both drop-ins call it with the raw ACO `ProductView` and deep merge the result into their model, so the transformers in `scripts/commerce-utils.js` read raw fields and return only price fields with the tax added, rounded to the cent. One rate per view ignores product tax classes and the shopper's address, which is acceptable for a French B2C shop and checked against PaaS on several SKUs (118.80 for 99.00, 999.00 for 832.50).

The VAT transformer is LPG business logic: Wellbox shows prices including tax, and ACO serves prices excluding tax. The PDP gets a second transformer, for price visibility, because of ACO data. See "Known issues and what remains custom".

### Showcase mode (LPG fr and en)

Views with `sells: false` render the PDP without `ProductPrice`, `ProductQuantity` or the add to cart button. The block adds a "Trouver un centre" button and a link to the same product in the pro store. Lists empty the `ProductPrice` slot and put a "Découvrir" link in `ProductActions`. The cart drop-in is not initialised and the header has no mini cart. All of this is block code, slots and configuration. No drop-in file changes.

### Labels

Each initializer passes `langDefinitions` built from placeholders, like the boilerplate. The boilerplate reads them from DA at `{root}placeholders/{file}.json`. DA has none for this lab yet, so `fetchPlaceholders` falls back to `/placeholders/{lang}/{file}.json` in this repository (French translations of the visible PDP, cart and search labels, and `Global.*` keys used by the blocks). Moving them to DA sheets only needs the same keys.

## History of the work-arounds

Re-checked on 20 November 2026 with the June 2026 suite, locally and on the branch preview.

The current list of open issues is in "Known issues" below.

Kept because of ACO data:

- The price visibility transformer (`pdpPriceVisibilityTransformer` in `scripts/commerce-utils.js`, passed as a PDP model transformer). This is a data issue, not a drop-in bug. ACO returns `roles: []` on `priceRange.minimum` and `priceRange.maximum` of configurable products, while simple products carry `["visible"]`. `storefront-pdp` shows a price only when its roles contain `visible`, which is correct behaviour. Without the transformer, WELLBOX 2 shows no price until a colour is chosen (checked again with pdp 3.2.0). The transformer marks the range visible only when ACO sent an empty list, and a `hidden` role still hides it. The fix belongs to the catalogue data, through the ACO connector or the price feed. Once the data carries `visible`, delete the transformer. To reproduce:

  ```sh
  curl -s https://na1-sandbox.api.commerce.adobe.com/QD1T4hbz1zGxLHYpp8cyPy/graphql \
    -H 'content-type: application/json' \
    -H 'AC-View-ID: 8aabd439-f2ab-4d91-a9b1-548fe45b389e' -H 'AC-Price-Book-ID: wellbox' \
    -d '{"query":"{ products(skus:[\"wellbox-2\",\"102036800\"]) { sku ... on SimpleProductView { price { roles } } ... on ComplexProductView { priceRange { minimum { roles } maximum { roles } } } } }"}'
  # wellbox-2 (configurable): roles [] on minimum and maximum. 102036800 (simple): roles ["visible"]
  ```

Removed:

- The `beforeHook` that stripped `has_available_free_gifts`, `is_free_gift` and `is_salable` from cart queries. This was a version gap. `storefront-cart` 3.3.1 does not query these fields, and its cart fragment validates against the sandbox as is.
- The cart page wait for `cart/initialized` before mounting `CartSummaryList`. The cart block now mounts the containers the way the boilerplate does. The display problem it hid is still there (K4).
- The `commerce/customer-context` refetch on the PDP, and the free-gift flag on the cart initializer. Both belong to later boilerplate versions.

## Known issues

Status on 20 November 2026. Root cause categories: Adobe drop-in, Adobe backend version, our config, ACO data, sandbox limit.

| # | Symptom | Where | Root cause | Proof | What fixes it | Status |
|---|---|---|---|---|---|---|
| K1 | Placing an order, the orders list and order details fail with `Cannot query field "admin_assisted_order" on type "CustomerOrder"`. Sign-up and account pages get `Cannot query field "shopping_assistance_enabled" on type "StoreConfig"` from their store config query | `/checkout` (place order), `/customer/orders`, `/customer/account`, `/customer/order-details`, `/order-details`, `/customer/create` | Adobe backend version. storefront-order 4.0.x, storefront-account 4.0.0 and storefront-auth 4.0.x (June 2026, seller-assisted buying) select fields that the sandbox schema with Compatibility Package 4.7.13 does not have. The June release notes list 4.7.13 as tested with these versions, which this sandbox does not confirm | `node tools/validate-dropin-graphql.mjs scripts/__dropins__ https://wellbox.lpg-migration-6j6zloi-37xbp5mgn7pn2.eu-4.magentosite.cloud/graphql wellbox_fr storefront-order storefront-account storefront-auth`: 8 order operations (including `PLACE_ORDER_MUTATION`), `GET_CUSTOMER_ORDERS_LIST`, `GET_ADMIN_ASSISTANCE_ACTIONS` and both `GET_STORE_CONFIG` fail validation. The same check on the April 2026 suite (order 3.3.0, account 3.3.0, auth 3.2.0, cart 3.2.0, checkout 3.2.1) finds no error on B2C operations | A Compatibility Package that adds the seller-assisted buying fields (needs ACO licence keys, see "Drop-in versions"), or the whole storefront on the April 2026 suite (tested by Adobe with 4.7.12). No drop-in patch | Open, decision for the owner |
| K2 | No payment method can complete an order | `/checkout` | Sandbox limit and our scope. The PaaS only offers Adyen methods, which need the Adyen web components. LPG does not use Payment Services | `cart { available_payment_methods }` returns 130 `adyen_*` codes and no offline method | Enable an offline method (`checkmo` or `banktransfer`) on `wellbox_fr` in the sandbox admin for tests, then build the Adyen integration as LPG business code | Open |
| K3 | Guest checkout impossible | `/checkout` | Sandbox config (`is_guest_checkout_enabled = false`, same as production) | `storeConfig { is_guest_checkout_enabled }`, and `setGuestEmailOnCart` answers "Guest checkout is not allowed" | None needed: the checkout shows the sign-in form. Change the store setting if guests must order | By design |
| K4 | Cart page row totals excluding tax (832,50 €) under a "TTC" label. A free gift line shows 125,00 € instead of 0. The order summary shows the subtotal excluding tax | `/wellbox/fr/cart` | Adobe drop-in (storefront-cart 3.3.1 and 3.4.1). `CartSummaryList` and `OrderSummary` read the tax display settings (`shoppingCartDisplaySetting`, from `storeConfig`) at their first render. When the cart comes from the session cache before `storeConfig` has loaded, they keep the "excluding tax" branch | `storeConfig` with `Store: wellbox_fr` returns `shopping_cart_display_price: 2`, `shopping_cart_display_subtotal: 2` (including tax). The same cart through GraphQL has `row_total_including_tax: 999`. In the same page, `MiniCart`, opened later, shows `including-tax-item-total` 999,00 €. Rendering the cart block after the `cart/initialized` event shows the right values | Adobe fix. No work-around kept (owner rule). Our block is the June boilerplate block, with the same options as the boilerplate `/cart` page | Open, to report to Adobe |
| K5 | Struck-through line price 1 165,83 € (excluding tax) next to 999,00 € (including tax) | Mini cart and cart page, WELLBOX 2 white | Adobe drop-in plus Magento schema. In "including tax" mode the struck total is `prices.original_row_total`, which Magento only returns excluding tax | Cart query: `original_row_total 1165.83`, `row_total_including_tax 999`, `price_including_tax 999` | Adobe fix (needs an "original row total including tax" value) | Open, to report to Adobe |
| K6 | WELLBOX 2 shows no price before a colour is chosen without our transformer | PDP of configurable products | ACO data. Configurable price ranges carry `roles: []` while simple products carry `["visible"]` | `curl` in "What remains custom" below | Fix the data (connector or price feed), then delete `pdpPriceVisibilityTransformer` | Work-around kept (data issue) |
| K7 | No `h1` on product pages | PDP | Adobe drop-in version gap. `ProductHeader` of storefront-pdp 3.2.0 renders the name in a `div`. 3.4.0 renders an `h1` | DOM of `/wellbox/fr/products/wellbox-2-wellbox-2` | Later suite, or the BYOM product page provides the `h1` | Open |
| K8 | Newer drop-ins break the cart (`has_available_free_gifts`, `is_free_gift`, `is_salable` unknown) | Every cart call with storefront-cart 3.4.x | Adobe backend version: Compatibility Package 4.7.13, and 4.7.14+ needs ACO licence keys on repo.magento.com | `tools/validate-dropin-graphql.mjs` on cart 3.4.1 | Stay on the June suite, or get 4.7.14+ | Mitigated by pinning |
| K9 | `/config.json` answers 404 | Every page | Our config: the site config service has no `public` section and the lab cannot write it | `curl -I https://dropins--lpg-storefront--yaissaoui.aem.page/config.json` | Put `config/site-config.public.json` in the config service | Fallback in place |
| K10 | Placeholders and the DA pages of `/cart`, `/checkout` and `/customer/*` do not exist in DA yet | aem.page preview | Content not created yet | `curl` on the preview answers 404 | Upload the drafts and create placeholder sheets in DA | Open |
| K11 | Hero and card images show `about:error` | Wellbox home (DA content) | DA content: the images of the demo pages are broken in DA | `.plain.html` of `/wellbox/fr/` | Re-upload the images in DA | Open |

What remains custom, and why:

- The VAT transformer for the Wellbox views is LPG business logic (`taxRate` in `config/sites.json`).
- Showcase mode on LPG `fr` and `en` is LPG business logic.
- The price visibility transformer is there because of ACO data (K6). To reproduce:

  ```sh
  curl -s https://na1-sandbox.api.commerce.adobe.com/QD1T4hbz1zGxLHYpp8cyPy/graphql \
    -H 'content-type: application/json' \
    -H 'AC-View-ID: 8aabd439-f2ab-4d91-a9b1-548fe45b389e' -H 'AC-Price-Book-ID: wellbox' \
    -d '{"query":"{ products(skus:[\"wellbox-2\",\"102036800\"]) { sku ... on SimpleProductView { price { roles } } ... on ComplexProductView { priceRange { minimum { roles } maximum { roles } } } } }"}'
  # wellbox-2 (configurable): roles [] on minimum and maximum. 102036800 (simple): roles ["visible"]
  ```

## Styles and fonts

Two themes use CSS custom properties on `body.site-lpg` and `body.site-wellbox`. Values measured on production on 19 Nov 2026 are noted as such in `styles/styles.css`. Anything marked "estimate" in the CSS was read from a screenshot and still needs measuring (button radius on LPG, badge colour, Wellbox accent red, fallback font `size-adjust` values).

Fonts load after LCP through `styles/fonts.css`, following the EDS performance rules. No third-party script runs before LCP.

| Font | Use | Licence | Source |
|---|---|---|---|
| General Sans 400, 600 | body text, buttons | ITF Free Font License 2.0, `fonts/LICENSE-GeneralSans-ITF-FFL.txt` | official Fontshare zip, files unmodified |
| Montserrat 700 | LPG headings | SIL OFL 1.1 | `@fontsource/montserrat` 5.3.0, latin subset |
| Lato 400, 700 | Wellbox headings and prices | SIL OFL 1.1 | `@fontsource/lato` 5.3.0, latin subset |

The ITF licence allows self-hosting through `@font-face` for the licensee's own websites (section 01). It forbids modifying, subsetting or converting the files and forbids handing them to "external designers, agencies, contractors" (section 02). SQLI builds this site for LPG, so the licensee question needs an answer before production. The safest route is for LPG to download General Sans itself and commit it to its own repository. Production uses LatoWebHeavy for Wellbox headings. The Google Fonts build of Lato has no Heavy weight, so Lato 700 stands in.

## Tests and lint

`npm test` runs `node --test` on `test/`. The tests cover the UE models and root files, the import map (every `@dropins/*` import resolves to a vendored file), the committed placeholders (format, same keys in French and English, tokens kept), the VAT and price visibility transformers on fake ACO payloads, the product path parsing, the config loading and its fallback, the public config resolved by the drop-in's own resolver (store header, view id and price book for each root, no secret), and the site and locale resolution. `npm run lint` runs ESLint (airbnb-base, with the rule relaxations of the commerce boilerplate) and Stylelint. Both ignore `scripts/__dropins__`.

## Not done yet

- DA pages for the cart, checkout, customer and order pages and the LPG product pages. The drafts exist in `drafts/` only, so the aem.page preview answers 404 there until someone uploads them to DA.live (K10).
- Order placement and order pages are blocked by K1 and K2.
- Returns (RMA), the seller-assisted buying pages and the wishlist are not built.
- Facets: the ACO views expose no facetable attribute, so the filter panel is empty.
- LPG categories: `fr` and `en` have no categories in ACO, so LPG category pages list nothing and the menu uses `fallbackNav`.
- The views not exported to ACO (es, it, de, nl, us, pro-fr, pro-en) fall back to the LPG fr catalogue view. They need their own ACO views or a PaaS catalogue route.
- BYOM or JSON2HTML for product and category pages, with `<meta name="sku">`.
- Store locator, newsletter, cookie consent and analytics. The checkout runs `initReCaptcha` like the boilerplate. It does nothing while reCAPTCHA is not configured on the PaaS. The drop-ins run with `acdl: false` and no event collector, so the sandbox sends no data to Adobe.

## Sources

- https://github.com/hlxsites/aem-boilerplate-commerce (local clone, state of commit `f00f929e` of 11 June 2026)
- https://github.com/aemsites/da-block-collection (local clone, `ue/` folder)
- https://docs.da.live/developers/reference/universal-editor
- https://experienceleague.adobe.com/en/tools/commerce-storefront/releases/2026-04/
- https://experienceleague.adobe.com/en/tools/commerce-storefront/releases/2026-06/
- https://github.com/adobe/aem-boilerplate
- https://experienceleague.adobe.com/developer/commerce/storefront/
- https://www.aem.live/docs/
- https://developer.adobe.com/commerce/services/optimizer/merchandising-services/using-the-api/
- https://experienceleague.adobe.com/en/docs/commerce/aco-optimizer-connector/headless-storefront
- https://www.fontshare.com/licenses/itf-ffl
