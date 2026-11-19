/*
 * GraphQL documents for Adobe Commerce PaaS 2.4.7 core GraphQL (not Catalog Service).
 * method GET: cacheable by Commerce and Fastly. method POST: mutations and private data.
 */

const PRODUCT_CARD = `
fragment ProductCard on ProductInterface {
  __typename uid sku name url_key stock_status
  short_description { html }
  small_image { url label }
  price_range { minimum_price {
    regular_price { value currency }
    final_price { value currency }
  } }
}`;

const PRODUCT_FULL = `
fragment ProductFull on ProductInterface {
  ...ProductCard
  meta_title meta_description
  description { html }
  media_gallery { url label position disabled }
  categories { uid name url_path breadcrumbs { category_uid category_name category_url_path } }
  custom_attributesV2 { items {
    code
    ... on AttributeValue { value }
    ... on AttributeSelectedOptions { selected_options { label value } }
  } }
  ... on ConfigurableProduct {
    configurable_options { uid attribute_code label values { uid label } }
  }
}`;

const CART_FIELDS = `
fragment CartFields on Cart {
  id total_quantity
  items {
    uid quantity
    product { sku name url_key small_image { url label } }
    prices { row_total { value currency } }
    ... on ConfigurableCartItem { configurable_options { option_label value_label } }
  }
  prices {
    subtotal_including_tax { value currency }
    grand_total { value currency }
  }
}`;

export const PRODUCT_BY_URL_KEY = {
  name: 'ProductByUrlKey',
  method: 'GET',
  query: `query ProductByUrlKey($urlKey: String!) {
  products(filter: { url_key: { eq: $urlKey } }) { items { ...ProductFull } }
}${PRODUCT_FULL}${PRODUCT_CARD}`,
};

export const PRODUCT_BY_SKU = {
  name: 'ProductBySku',
  method: 'GET',
  query: `query ProductBySku($sku: String!) {
  products(filter: { sku: { eq: $sku } }) { items { ...ProductFull } }
}${PRODUCT_FULL}${PRODUCT_CARD}`,
};

export const CATEGORY_BY_URL_PATH = {
  name: 'CategoryByUrlPath',
  method: 'GET',
  query: `query CategoryByUrlPath($urlPath: String!) {
  categories(filters: { url_path: { eq: $urlPath } }) {
    items {
      uid name url_path description meta_title meta_description image
      breadcrumbs { category_uid category_name category_url_path }
    }
  }
}`,
};

export const PRODUCTS_BY_CATEGORY = {
  name: 'ProductsByCategory',
  method: 'GET',
  query: `query ProductsByCategory($uid: String!, $pageSize: Int!, $currentPage: Int!, $sort: ProductAttributeSortInput) {
  products(filter: { category_uid: { eq: $uid } }, pageSize: $pageSize, currentPage: $currentPage, sort: $sort) {
    total_count
    page_info { current_page page_size total_pages }
    items { ...ProductCard }
  }
}${PRODUCT_CARD}`,
};

export const PRODUCT_SEARCH = {
  name: 'ProductSearch',
  method: 'GET',
  query: `query ProductSearch($search: String!, $pageSize: Int!, $currentPage: Int!) {
  products(search: $search, pageSize: $pageSize, currentPage: $currentPage) {
    total_count
    page_info { current_page page_size total_pages }
    items { ...ProductCard }
  }
}${PRODUCT_CARD}`,
};

const TREE_NODE = 'uid name url_path include_in_menu position';

export const CATEGORY_TREE = {
  name: 'CategoryTree',
  method: 'GET',
  query: `query CategoryTree {
  categoryList {
    ${TREE_NODE}
    children { ${TREE_NODE} children { ${TREE_NODE} children { ${TREE_NODE} } } }
  }
}`,
};

export const CREATE_GUEST_CART = {
  name: 'CreateGuestCart',
  method: 'POST',
  query: 'mutation CreateGuestCart { createGuestCart { cart { id } } }',
};

export const ADD_PRODUCTS_TO_CART = {
  name: 'AddProductsToCart',
  method: 'POST',
  query: `mutation AddProductsToCart($cartId: String!, $items: [CartItemInput!]!) {
  addProductsToCart(cartId: $cartId, cartItems: $items) {
    cart { ...CartFields }
    user_errors { code message }
  }
}${CART_FIELDS}`,
};

// The cart is private: POST so no shared cache ever stores it.
export const GET_CART = {
  name: 'GetCart',
  method: 'POST',
  query: `query GetCart($cartId: String!) { cart(cart_id: $cartId) { ...CartFields } }${CART_FIELDS}`,
};

/** Sort keys exposed to blocks, mapped to ProductAttributeSortInput. */
export const SORTS = {
  position: { position: 'ASC' },
  name: { name: 'ASC' },
  price_asc: { price: 'ASC' },
  price_desc: { price: 'DESC' },
};
