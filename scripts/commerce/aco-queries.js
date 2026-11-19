/*
 * GraphQL documents for the Adobe Commerce Optimizer (ACO) Merchandising API.
 * Reference: https://developer.adobe.com/commerce/services/reference/graphql/
 * Headers are added by aco.js (AC-View-ID, AC-Price-Book-ID). No Store header.
 *
 * Deprecated fields that the live sandbox schema no longer exposes (inStock, addToCartAllowed,
 * url, inputOptions) are not requested.
 */

const MONEY = 'amount { value currency }';
const PRICE = `regular { ${MONEY} } final { ${MONEY} } roles`;

const ACO_CARD = `
fragment AcoCard on ProductView {
  __typename id sku name urlKey shortDescription
  images(roles: []) { url label roles }
  ... on SimpleProductView { price { ${PRICE} } }
  ... on ComplexProductView {
    priceRange { minimum { ${PRICE} } maximum { ${PRICE} } }
    options { id title required values { id title inStock } }
  }
}`;

const ACO_FULL = `
fragment AcoFull on ProductView {
  ...AcoCard
  description metaTitle metaDescription
  attributes { name label value roles }
  categories { slug name level parents { slug name } }
}`;

export const ACO_PRODUCTS_BY_SKU = {
  name: 'AcoProductsBySku',
  method: 'GET',
  query: `query AcoProductsBySku($skus: [String]) {
  products(skus: $skus) { ...AcoFull }
}${ACO_FULL}${ACO_CARD}`,
};

/* url_key is filterable in productSearch on the sandbox (checked live on 19 Nov 2026). */
export const ACO_PRODUCT_BY_URL_KEY = {
  name: 'AcoProductByUrlKey',
  method: 'GET',
  query: `query AcoProductByUrlKey($urlKey: String!) {
  productSearch(phrase: "", page_size: 1, filter: [{ attribute: "url_key", eq: $urlKey }]) {
    items { productView { ...AcoFull } }
  }
}${ACO_FULL}${ACO_CARD}`,
};

/* Category slugs are the Magento url_path (connector field mapping). */
export const ACO_CATEGORIES = {
  name: 'AcoCategories',
  method: 'GET',
  query: `query AcoCategories($slugs: [String!]) {
  categoryTree(slugs: $slugs, depth: 1) {
    slug name description level parentSlug
    metaTags { title description }
    images { url label }
  }
}`,
};

const SEARCH_RESULT = `
  total_count
  page_info { current_page page_size total_pages }
  items { productView { ...AcoCard } }`;

export const ACO_PRODUCTS_BY_CATEGORY = {
  name: 'AcoProductsByCategory',
  method: 'GET',
  query: `query AcoProductsByCategory($slug: String!, $pageSize: Int, $currentPage: Int, $sort: [ProductSearchSortInput!]) {
  productSearch(phrase: "", page_size: $pageSize, current_page: $currentPage, sort: $sort,
    filter: [{ attribute: "categoryPath", eq: $slug }]) {${SEARCH_RESULT}
  }
}${ACO_CARD}`,
};

export const ACO_SEARCH = {
  name: 'AcoSearch',
  method: 'GET',
  query: `query AcoSearch($phrase: String!, $pageSize: Int, $currentPage: Int) {
  productSearch(phrase: $phrase, page_size: $pageSize, current_page: $currentPage) {${SEARCH_RESULT}
  }
}${ACO_CARD}`,
};

/* The connector puts active categories with include_in_menu in the family top_menu. */
const NAV_NODE = 'slug name';
export const ACO_NAVIGATION = {
  name: 'AcoNavigation',
  method: 'GET',
  query: `query AcoNavigation($family: String!) {
  navigation(family: $family) {
    ${NAV_NODE}
    children { ${NAV_NODE} children { ${NAV_NODE} children { ${NAV_NODE} } } }
  }
}`,
};

/* Prices only, used to fill gaps from the base price book (see aco.js). */
export const ACO_PRICES_BY_SKU = {
  name: 'AcoPricesBySku',
  method: 'GET',
  query: `query AcoPricesBySku($skus: [String]) {
  products(skus: $skus) {
    sku
    ... on SimpleProductView { price { ${PRICE} } }
    ... on ComplexProductView { priceRange { minimum { ${PRICE} } maximum { ${PRICE} } } }
  }
}`,
};

/* Resolves the simple product behind a set of option value ids. */
export const ACO_REFINE_PRODUCT = {
  name: 'AcoRefineProduct',
  method: 'GET',
  query: `query AcoRefineProduct($sku: String!, $optionIds: [String!]!) {
  refineProduct(sku: $sku, optionIds: $optionIds) { __typename sku name }
}`,
};

/** Sort keys exposed to blocks, mapped to ProductSearchSortInput. */
export const ACO_SORTS = {
  position: [{ attribute: 'position', direction: 'ASC' }],
  name: [{ attribute: 'name', direction: 'ASC' }],
  price_asc: [{ attribute: 'price', direction: 'ASC' }],
  price_desc: [{ attribute: 'price', direction: 'DESC' }],
};
