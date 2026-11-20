import { initializers } from '@dropins/tools/initializer.js';
import { initialize, setEndpoint, fetchProductData } from '@dropins/storefront-pdp/api.js';
import { initializeDropin } from './index.js';
import {
  CS_FETCH_GRAPHQL,
  fetchPlaceholders,
  getOptionsUIDsFromUrl,
  preloadFile,
  resolveProductSku,
} from '../commerce.js';
import {
  combineTransformers,
  pdpPriceVisibilityTransformer,
  pdpVatTransformer,
} from '../commerce-utils.js';
import { getSiteContext } from '../site-config.js';

export const IMAGES_SIZES = {
  width: 960,
  height: 960,
};

function preloadPDPAssets() {
  [
    'api.js',
    'render.js',
    'containers/ProductHeader.js',
    'containers/ProductPrice.js',
    'containers/ProductShortDescription.js',
    'containers/ProductOptions.js',
    'containers/ProductQuantity.js',
    'containers/ProductDescription.js',
    'containers/ProductAttributes.js',
    'containers/ProductGallery.js',
  ].forEach((file) => preloadFile(`/scripts/__dropins__/storefront-pdp/${file}`, 'script'));
}

await initializeDropin(async () => {
  // Inherit Fetch GraphQL Instance (Catalog Service)
  setEndpoint(CS_FETCH_GRAPHQL);
  preloadPDPAssets();

  const ctx = await getSiteContext();
  const optionsUIDs = getOptionsUIDsFromUrl();
  // meta sku, /products/{urlKey}/{sku}, then an ACO lookup by url_key (lab URLs)
  const sku = await resolveProductSku().catch((e) => {
    console.error('pdp: sku lookup failed', e);
    return null;
  });
  // The block shows its own "not found" message, no redirect to 404 as in the boilerplate.
  if (!sku) return undefined;

  const [product, labels] = await Promise.all([
    fetchProductData(sku, { optionsUIDs, skipTransform: true }),
    fetchPlaceholders('placeholders/pdp.json'),
  ]);

  const models = {
    ProductDetails: {
      initialData: { ...product },
      // Model transformer: configuration, no change to drop-in code. It receives the raw
      // ProductView (parent, then each variant picked in the options).
      // - ACO prices exclude tax. Wellbox shows prices including VAT: add the view rate.
      // - ACO sends no "visible" role on configurable price ranges: show them anyway.
      transformer: combineTransformers(
        (raw) => pdpVatTransformer(raw, ctx.taxRate),
        pdpPriceVisibilityTransformer,
      ),
    },
  };

  return initializers.mountImmediately(initialize, {
    sku,
    optionsUIDs,
    langDefinitions: { default: { ...labels } },
    models,
    acdl: false,
    persistURLParams: true,
  });
})();
