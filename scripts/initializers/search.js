import { initializers } from '@dropins/tools/initializer.js';
import { initialize, setEndpoint } from '@dropins/storefront-product-discovery/api.js';
import { initializeDropin } from './index.js';
import { CS_FETCH_GRAPHQL, fetchPlaceholders } from '../commerce.js';
import { discoveryVatTransformer } from '../commerce-utils.js';
import { getSiteContext } from '../site-config.js';

await initializeDropin(async () => {
  // Inherit Fetch GraphQL Instance (Catalog Service)
  setEndpoint(CS_FETCH_GRAPHQL);

  const [labels, ctx] = await Promise.all([
    fetchPlaceholders('placeholders/search.json'),
    getSiteContext(),
  ]);
  const langDefinitions = { default: { ...labels } };

  // ACO prices exclude tax. Views that display prices including tax (Wellbox) add it
  // through the model transformer, which is configuration, not a change to the drop-in.
  const models = ctx.taxRate
    ? { Product: { transformer: (raw) => discoveryVatTransformer(raw, ctx.taxRate) } }
    : undefined;

  return initializers.mountImmediately(initialize, { langDefinitions, models });
})();
