import { initializers } from '@dropins/tools/initializer.js';
import { initialize, setEndpoint } from '@dropins/storefront-auth/api.js';
import { getConfigValue } from '@dropins/tools/lib/aem/configs.js';
import { initializeDropin } from './index.js';
import { CORE_FETCH_GRAPHQL, fetchPlaceholders } from '../commerce.js';

await initializeDropin(async () => {
  // Set Fetch GraphQL (Core)
  setEndpoint(CORE_FETCH_GRAPHQL);

  const labels = await fetchPlaceholders('placeholders/auth.json');
  const langDefinitions = { default: { ...labels } };

  // adobeCommerceOptimizer: the drop-in reads the shopper price book from PaaS
  // (commerceOptimizer { priceBookId }) and emits auth/adobe-commerce-optimizer.
  return initializers.mountImmediately(initialize, {
    langDefinitions,
    adobeCommerceOptimizer: getConfigValue('adobe-commerce-optimizer'),
  });
})();
