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
| `@dropins/build-tools` (dev) | boilerplate of June 2026 | 1.2.0 |

The suite also lists checkout ~3.3.0, order ~4.0.0, account ~4.0.0, recommendations ~4.0.4 and wishlist ~3.3.0, which this lab does not use yet.

These versions come with some caveats:

- `storefront-auth` 4.0.1 and `storefront-cart` 3.3.1 were published on 29 July 2026, and `storefront-product-discovery` 3.1.2 and 3.1.3 in September and October. The boilerplate shipped them next to `@dropins/tools` 2.x and 3.x. They are patch releases inside the June ranges. Every import they make from `@dropins/tools` exists in 1.9.0 (checked by script), and the pages below work with them. If one misbehaves, the exact June builds are auth 4.0.0, cart 3.3.0 and product-discovery 3.1.1.
- The project code (`scripts/commerce.js`, `scripts/initializers/`, the commerce blocks, `head.html`) follows the boilerplate as it was on 11 June 2026 (commit `f00f929e`, "bump all drop-in packages to stable"). Two exceptions: no free-gift flag on the cart initializer, and the module preloads that tools 1.9.0 actually ships.

To move to the latest suite once Compatibility Package 4.7.14 or later is installable (ACO licence keys on repo.magento.com):

1. Install the package on the PaaS (`composer require` of the Storefront Compatibility Package in the lpg-ops overlay), deploy it to `lpg-migration` and check that the cart query of the target cart version validates. Run `CART_FRAGMENT` from `scripts/__dropins__/storefront-cart/fragments.js` against `/graphql` with a guest cart id.
2. Read the release notes of the target suite on the Adobe storefront releases page and copy its versions into `package.json`. Copy `build.mjs` from the boilerplate commit of that release.
3. Run `npm install` then `npm run install:dropins` in the container, and commit `scripts/__dropins__`.
4. Diff `scripts/commerce.js`, `scripts/initializers/*`, `head.html` and the commerce blocks against the boilerplate at that release (`git log --until=<release date>` in a clone) and port the API changes. For example, recent releases add `features.isFreeGiftsCartPriceRulesEnabled` to the cart initializer and a `commerce/customer-context` event.
5. Re-run the checks of "Known issues and what remains custom". Some of them are fixed in later suites. For example `storefront-pdp` 3.4.0 renders the product name as an `h1`, which 3.2.0 does not.
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

## Known issues and what remains custom

Re-checked on 20 November 2026 with the June 2026 suite, locally and on the branch preview.

Kept because it is LPG business logic:

- The VAT transformer for the Wellbox views (`taxRate` in `config/sites.json`, see "VAT and price visibility").
- Showcase mode on LPG `fr` and `en` (see above).

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
- The cart page wait for `cart/initialized` before mounting `CartSummaryList`. The cart block now mounts the containers the way the boilerplate does. The display problem it hid is still there (issue 1 below).
- The `commerce/customer-context` refetch on the PDP, and the free-gift flag on the cart initializer. Both belong to later boilerplate versions.

Open, not worked around. These are suspected Adobe drop-in bugs, not reported to Adobe yet:

1. Cart page row totals excluding tax under a "TTC" label (`storefront-cart` 3.3.1 and 3.4.1). The sandbox sets `shopping_cart_display_price = 2` (including tax) on `wellbox_fr`. On `/wellbox/fr/cart`, `CartSummaryList` renders `data-testid="regular-item-total"` with `row_total` (832,50 €) and a "TTC" label. A free gift line shows its `original_row_total` (125,00 €) instead of 0. The `MiniCart` opened later on the same page renders `including-tax-item-total` with 999,00 €. The behaviour suggests the container reads the tax display setting from the cart state at its first render (`config.shoppingCartDisplaySetting`) before the cart has loaded `storeConfig`, and keeps that branch. Minimal reproduction: on a PaaS store with "Display Cart Prices: Including Tax", add a discounted product to a guest cart, then load a page whose only commerce block is the boilerplate `commerce-cart`. Waiting for the `cart/initialized` event before rendering the container makes it correct, which supports the timing explanation.
2. Struck-through price mixes tax bases (`storefront-cart` 3.3.1 and 3.4.1). In "including tax" mode the struck line total is `prices.original_row_total`, which Magento returns excluding tax (1 165,83 €), next to the discounted `row_total_including_tax` (999,00 €). The expected value is 1 399,00 €. Visible in the mini cart and on the cart page for WELLBOX 2 white. The same cart through PaaS GraphQL returns `price_including_tax 999`, `row_total_including_tax 999` and `original_row_total 1165.83`. Magento has no "original row total including tax" field, so the fix may need a schema change as well as a drop-in change.
3. Order summary subtotal excluding tax (832,50 €, then VAT 166,50 €, total 999,00 €), while `shopping_cart_display_subtotal = 2`. Not investigated further. It may come from the same cause as issue 1.
4. The PDP has no `h1` with `storefront-pdp` 3.2.0. `ProductHeader` renders the name in a `div`, and 3.4.0 renders an `h1`. This is a version gap. Server-side rendering (BYOM) of product pages should provide the `h1` for SEO.

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

`npm test` runs `node --test` on `test/`. The tests cover the VAT and price visibility transformers on fake ACO payloads, the product path parsing, the config loading and its fallback, the public config resolved by the drop-in's own resolver (store header, view id and price book for each root, no secret), and the site and locale resolution. `npm run lint` runs ESLint (airbnb-base, with the rule relaxations of the commerce boilerplate) and Stylelint. Both ignore `scripts/__dropins__`.

## Not done yet

- DA pages for `/wellbox/fr/cart` and the LPG product pages. The cart and LPG PDP drafts exist only in `drafts/`, so the aem.page preview answers 404 there until someone creates them in DA.live (one `commerce-cart` block, one empty `product-details` block).
- Checkout, payment and order confirmation. The mini cart and the cart page have no checkout button.
- Customer account and login. The auth drop-in is initialised for the price book only. Sign in must call nothing extra: the drop-in emits the customer price book itself.
- Facets: the ACO views expose no facetable attribute, so the filter panel is empty.
- LPG categories: `fr` and `en` have no categories in ACO, so LPG category pages list nothing and the menu uses `fallbackNav`.
- The views not exported to ACO (es, it, de, nl, us, pro-fr, pro-en) fall back to the LPG fr catalogue view. They need their own ACO views or a PaaS catalogue route.
- BYOM or JSON2HTML for product and category pages, with `<meta name="sku">`.
- Store locator, newsletter, cookie consent and analytics. The drop-ins run with `acdl: false` and no event collector, so the sandbox sends no data to Adobe.

## Sources

- https://github.com/hlxsites/aem-boilerplate-commerce (local clone, state of commit `f00f929e` of 11 June 2026)
- https://experienceleague.adobe.com/en/tools/commerce-storefront/releases/2026-06/
- https://github.com/adobe/aem-boilerplate
- https://experienceleague.adobe.com/developer/commerce/storefront/
- https://www.aem.live/docs/
- https://developer.adobe.com/commerce/services/optimizer/merchandising-services/using-the-api/
- https://experienceleague.adobe.com/en/docs/commerce/aco-optimizer-connector/headless-storefront
- https://www.fontshare.com/licenses/itf-ffl
