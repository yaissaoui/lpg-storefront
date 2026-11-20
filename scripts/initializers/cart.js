import { initializers } from '@dropins/tools/initializer.js';
import { initialize, setEndpoint } from '@dropins/storefront-cart/api.js';
import { getConfigValue } from '@dropins/tools/lib/aem/configs.js';
import { initializeDropin } from './index.js';
import { CORE_FETCH_GRAPHQL, fetchPlaceholders } from '../commerce.js';

// Opt-in per site, like the boilerplate (needs Magento_SalesRuleFreeGiftGraphQl).
function isFreeGiftsEnabled() {
  const value = getConfigValue('commerce-free-gifts-enabled');
  return value === true || (typeof value === 'string' && value.toLowerCase() === 'true');
}

await initializeDropin(async () => {
  // Cart on the PaaS core GraphQL, Store header from headers.all
  setEndpoint(CORE_FETCH_GRAPHQL);

  const labels = await fetchPlaceholders('placeholders/cart.json');
  const langDefinitions = { default: { ...labels } };

  return initializers.mountImmediately(initialize, {
    langDefinitions,
    features: {
      isFreeGiftsCartPriceRulesEnabled: isFreeGiftsEnabled(),
    },
  });
})();
