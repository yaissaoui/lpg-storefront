# LPG storefront on Edge Delivery Services (lab)

First version of the EDS storefront for the LPG migration lab. It covers two sites from one code base: the institutional LPG catalogue and the Wellbox shop. It reads Adobe Commerce PaaS 2.4.7 through its core GraphQL and uses custom blocks only. The plan behind it is in `../docs/PLAN.en.md`, sections 4 and 6.

The code starts from `adobe/aem-boilerplate` (Apache-2.0, commit `599a356`). `scripts/aem.js` is vendored from it and must not be edited.

Any document or screenshot from this repository that goes to the client needs a human review first.

## Rules that apply here

- The repository must stay private. It contains LPG brand assets (`icons/lpg-logo.svg`, `icons/wellbox-logo.svg`, downloaded from the production sites on 19 Nov 2026) and the General Sans font files. Making it public needs LPG's agreement and a new check of the font licence.
- No `@dropins/*` package and no Storefront Compatibility Package. See the last section.
- No real customer or product data. Fixtures use DEMO skus, fake prices and placeholder SVGs.
- Nothing is pushed. The local git repository has a placeholder `origin` remote (`example-org/lpg-storefront`) because the AEM CLI refuses to start without one. Its push URL is set to `PUSH-DISABLED-local-lab-only`, so a push fails.

## Run it locally

Everything runs in the lab container (`make up` from the repository root starts it).

```sh
# from the repository root
docker compose --env-file .env -f env/docker-compose.yml exec -T toolchain \
  bash -c 'cd storefront && aem up --no-open --addr "*" --html-folder drafts --html-mount /'
```

Then open <http://localhost:3000/fr/index>.

`--html-mount /` matters. Without it the CLI serves the drafts under `/drafts/...`, and the locale and site detection, which read the first path segment, would see `drafts` instead of `fr`. The existing `make preview` target does not pass these flags, so it shows no local content.

Install and check:

```sh
docker compose --env-file .env -f env/docker-compose.yml exec -T -u "$(id -u):$(id -g)" -e HOME=/tmp/h toolchain \
  bash -c 'cd storefront && npm install && npm run lint && npm test'
```

The `-u` flag is there because the container user is uid 1000 and the files on the host may belong to another uid. Without it `npm install` cannot write `node_modules`.

### Pages available in `drafts/`

| URL | Content |
|---|---|
| `/fr/index` | LPG home: hero, reinsurance row, teasers, expertise cards, figures, testimonials |
| `/fr/expertise-esthetique/cosmetiques/cosmetiques-visage` | LPG product list (8 fixture products, sort, pagination with `?page=`) |
| `/fr/products/demo-serum-a` | LPG product page, no price, "Où trouver ce produit" |
| `/fr/search?q=demo` | Search results |
| `/wellbox/fr/index` | Wellbox home |
| `/wellbox/fr/products/demo-device-w` | Wellbox product page with price, colour choice, add to cart and mini cart |

`?site=wellbox` on any page forces the Wellbox theme and store view. `?site=auto` removes the override.

## Structure

```text
blocks/
  header/          logo, category menu (getCategoryTree, static fallback), search, account, mini cart
  footer/          4 columns from the {locale}/footer fragment, language switcher
  hero/            full-width image or video, uppercase title
  cards/           expertise cards, variants reinsurance and stats
  teaser/          image and text side by side
  testimonials/    simplified slider (scroll snap and two buttons)
  product-list/    PLP, variant compact for related products
  product-details/ PDP: gallery, options, tabs, price and cart only on selling views
  search/          search results
  columns/ fragment/ widget/   kept from the boilerplate
config/sites.json  sites, locales, store view codes, sells flag, endpoint
scripts/
  scripts.js       boilerplate loader, sets body.site-lpg or body.site-wellbox and html lang
  site-config.js   site and locale resolution (pure functions, tested)
  commerce/        the data module, see scripts/commerce/README.md
  product-ui.js    shared rendering helpers (cards, prices, sanitising)
  i18n.js          UI strings (fr, en, English fallback)
styles/            styles.css (themes), fonts.css (after LCP), product-card.css (on demand)
drafts/            local content as .plain.html files (ignored by .hlxignore)
tools/             dev-graphql-proxy.mjs (ignored by .hlxignore)
test/              node:test unit tests
```

## Sites and locales

`config/sites.json` holds the whole mapping. The browser fetches it once per page.

The site comes from the hostname. A host containing `wellbox` selects Wellbox, anything else selects LPG. On dev hosts (`localhost`, `127.0.0.1`, `*.aem.page`) three overrides apply, in this order: `?site=<key>` (kept in `localStorage`), the site's `devPathPrefix` (`/wellbox/...`), then the stored value. Production hosts ignore them.

The locale is the first path segment. EDS folder names use hyphens and Commerce store view codes keep underscores, and each locale maps them explicitly:

| Site | Folder | Store view | Sells |
|---|---|---|---|
| lpg | `fr`, `en`, `es`, `it`, `de`, `nl`, `us` | same code | no |
| lpg | `pro-fr`, `pro-en` | `pro_fr`, `pro_en` | yes |
| wellbox | `fr`, `en` | `wellbox_fr`, `wellbox_en` | yes |

`sells` decides whether prices, quantity and the add to cart button appear. On 19 Nov 2026 the institutional LPG site showed no price and no cart, while Wellbox showed prices and a black "Ajouter au panier" button. The pro views are set to sell because they serve professionals. That is an assumption from the brief, not something observed. `miniCart` defaults to `sells`.

Each request to Commerce carries the header `Store: <store view code>`.

## Data module

Blocks call `getProduct`, `listCategory`, `search`, `getCategoryTree` and `cart.create`, `cart.add`, `cart.get`. They never call GraphQL. The contract, the shapes and the queries are documented in `scripts/commerce/README.md`. This module is where the switch to Commerce as a Cloud Service or API Mesh will happen.

## Fixture mode

`commerce-endpoint` is empty in `config/sites.json`, so the module runs on fixtures. Product and list pages show a small blue notice on dev hosts so nobody mistakes demo data for the sandbox.

## Pointing at the sandbox

The sandbox environment does not exist yet. Once the project owner fills `SANDBOX_DEFAULT_URL` in the root `.env`:

1. Start the proxy with `make graphql-proxy`. It forwards `http://localhost:3001/graphql` to `$SANDBOX_DEFAULT_URL/graphql`. Another URL can be given with `make graphql-proxy COMMERCE_GRAPHQL_URL=https://<host>/graphql`.
2. In the browser console on `http://localhost:3000`, run `localStorage.setItem('commerce-endpoint', 'http://localhost:3001/graphql')` and reload. `localStorage.removeItem('commerce-endpoint')` goes back to fixtures. This override only works on dev hosts.
3. For a shared preview, set `commerce-endpoint` in `config/sites.json` to `https://<host>/graphql`, or per site with a `commerce-endpoint` key inside the site entry. A direct call from `*.aem.page` to the sandbox needs CORS on the Commerce side.

The proxy only exists for local development. It allows the origin `http://localhost:3000` only, forwards the `Store` header, never forwards cookies and logs no request body. The Adobe documentation prefers same-origin delivery (a CDN route from the EDS host to `/graphql`) and treats CORS as a last resort. That decision belongs to the delivery set-up of phase B (API Mesh) or to the CDN configuration.

## Content

Real content will come from DA.live. Until then `drafts/` holds `.plain.html` files with EDS semantic markup (sections as top-level `div`, blocks as `div` tables). `aem up --html-folder` wraps them with `head.html` and serves them like delivered pages. The raw file stays available at `<path>.plain.html`, which is how the footer fragment loads.

The boilerplate's current `aem.js` no longer reads `section-metadata` blocks in the browser (my reading of the code, the delivery pipeline now handles them). The drafts therefore put section styles straight on the section `div`, for example `<div class="grey centered">`.

Production product and category pages must come from BYOM or JSON2HTML, not from folder mapping, which the documentation discourages for SEO. Locally, the product-details block reads the `url_key` from the last path segment, and one draft page per test product is enough. The product-list block reads the category from its `category` row or from the path after the locale.

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

`npm test` runs `node --test` on `test/`. The tests cover the store mapping and site resolution, normalisation, fixture mode (catalogue, sort, pagination, cart), the GET or POST choice with the `Store` header, and the dev proxy. `npm run lint` runs ESLint (airbnb-base) and Stylelint from the boilerplate.

## Not done yet

- Checkout, payment and order confirmation.
- Customer account, login and the pro area behind "Espace Pro". The link points to a page that does not exist.
- BYOM or JSON2HTML for product and category pages.
- The multi-site set-up on aem.live (one code repository, two sites) and the configuration in the Admin API.
- Content in DA.live, navigation and footer authored there, and the other locales.
- The store locator, the newsletter form, cookie consent and analytics.
- Structured data (JSON-LD) for products, which belongs in the server-side rendering anyway.
- The business rule from `Lpg_Checkout` that hides the mini cart for guests on `pro_fr`, `pro_en`, `fr` and `en`.

## Why drop-ins are not used

Adobe licenses the commerce drop-ins (`@dropins/*`) for Commerce as a Cloud Service and Commerce Optimizer. A PaaS licence alone does not include them, and the Storefront Compatibility Package needed to connect them to PaaS is described as unavailable without Optimizer. The npm packages download without an account, but the licence forbids that use, and the drop-in agreement also binds the integrator. This storefront therefore uses custom blocks behind the data module (route A of the plan). The full reasoning and the questions for Adobe are in `../docs/PLAN.en.md` and `../docs/ADOBE-QUESTIONS.md`.

## Sources

- https://github.com/adobe/aem-boilerplate
- https://www.aem.live/docs/
- https://www.aem.live/developer/keeping-it-100
- https://www.fontshare.com/licenses/itf-ffl
