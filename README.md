# LPG storefront on Edge Delivery Services (lab)

EDS storefront for the LPG migration lab. One code base serves two sites: the institutional LPG catalogue and the Wellbox shop. Commerce features use the Adobe drop-ins, wired like the Adobe commerce boilerplate (`hlxsites/aem-boilerplate-commerce` v12.0.0). The catalogue comes from Adobe Commerce Optimizer (ACO). The cart runs on the PaaS 2.4.7 core GraphQL of the sandbox `lpg-migration`. The plan behind it is in `../docs/PLAN.en.md`, sections 4 and 6.

The code started from `adobe/aem-boilerplate` (Apache-2.0, commit `599a356`). `scripts/aem.js` is vendored from it and must not be edited. The drop-ins are vendored in `scripts/__dropins__` and must not be edited either.

Any document or screenshot from this repository that goes to the client needs a human review first.

## Rules that apply here

- Drop-ins are allowed because the lab uses Commerce Optimizer, whose licence covers them (decision of 20 November 2026, `../docs/ACO-PAAS.md` section 11). Production needs the client's own ACO licence.
- Code under `scripts/__dropins__` is never edited. Extensions go through slots, events, configuration (including model transformers) and our own `FetchGraphQL` hooks, like the boilerplate.
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

ACO also returns `roles: []` on the price range of configurable products, while simple products carry `["visible"]`. The PDP drop-in hides a price without the `visible` role, so WELLBOX 2 showed no price. A second transformer marks such ranges visible. A `hidden` role still hides the price.

### Cart on PaaS 2.4.7

`storefront-cart` 3.4.1 always selects `Cart.has_available_free_gifts`, `CartItemInterface.is_free_gift` and `CartItemInterface.is_salable`. The sandbox (2.4.7-p10 with the Storefront Compatibility Package 4.7.13) has none of them, so every cart call failed. `build.mjs` can only add fields or drop whole fragments, so a `beforeHook` on `CORE_FETCH_GRAPHQL` removes these three scalars from POST bodies. The drop-in treats the missing values as "not a free gift" and falls back from `is_salable` to `is_available`. A newer compatibility package may add the fields, in which case the hook can go.

The cart page waits for the `cart/initialized` event before it mounts `CartSummaryList`. Mounted earlier, the container rendered row totals excluding tax under a "TTC" label.

### Showcase mode (LPG fr and en)

Views with `sells: false` render the PDP without `ProductPrice`, `ProductQuantity` or the add to cart button. The block adds a "Trouver un centre" button and a link to the same product in the pro store. Lists empty the `ProductPrice` slot and put a "Découvrir" link in `ProductActions`. The cart drop-in is not initialised and the header has no mini cart. All of this is block code, slots and configuration. No drop-in file changes.

### Labels

Each initializer passes `langDefinitions` built from placeholders, like the boilerplate. The boilerplate reads them from DA at `{root}placeholders/{file}.json`. DA has none for this lab yet, so `fetchPlaceholders` falls back to `/placeholders/{lang}/{file}.json` in this repository (French translations of the visible PDP, cart and search labels, and `Global.*` keys used by the blocks). Moving them to DA sheets only needs the same keys.

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

`npm test` runs `node --test` on `test/`. The tests cover the VAT and price visibility transformers on fake ACO payloads, the product path parsing, the config loading and its fallback, the cart field filter, the public config resolved by the drop-in's own resolver (store header, view id and price book for each root, no secret), and the site and locale resolution. `npm run lint` runs ESLint (airbnb-base, with the rule relaxations of the commerce boilerplate) and Stylelint. Both ignore `scripts/__dropins__`.

## Not done yet

- DA pages for `/wellbox/fr/cart` and the LPG product pages. The cart and LPG PDP drafts exist only in `drafts/`, so the aem.page preview answers 404 there until someone creates them in DA.live (one `commerce-cart` block, one empty `product-details` block).
- Checkout, payment and order confirmation. The mini cart and the cart page have no checkout button.
- Customer account and login. The auth drop-in is initialised for the price book only. Sign in must call nothing extra: the drop-in emits the customer price book itself.
- Facets: the ACO views expose no facetable attribute, so the filter panel is empty.
- LPG categories: `fr` and `en` have no categories in ACO, so LPG category pages list nothing and the menu uses `fallbackNav`.
- The views not exported to ACO (es, it, de, nl, us, pro-fr, pro-en) fall back to the LPG fr catalogue view. They need their own ACO views or a PaaS catalogue route.
- BYOM or JSON2HTML for product and category pages, with `<meta name="sku">`.
- The order summary on the cart page shows the subtotal excluding tax, then the VAT, then the total. The PaaS setting asks for subtotals including tax. Not investigated further.
- Store locator, newsletter, cookie consent and analytics. The drop-ins run with `acdl: false` and no event collector, so the sandbox sends no data to Adobe.

## Sources

- https://github.com/hlxsites/aem-boilerplate-commerce (v12.0.0, local clone used as reference)
- https://github.com/adobe/aem-boilerplate
- https://experienceleague.adobe.com/developer/commerce/storefront/
- https://www.aem.live/docs/
- https://developer.adobe.com/commerce/services/optimizer/merchandising-services/using-the-api/
- https://experienceleague.adobe.com/en/docs/commerce/aco-optimizer-connector/headless-storefront
- https://www.fontshare.com/licenses/itf-ffl
