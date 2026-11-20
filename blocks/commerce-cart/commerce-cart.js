/*
 * Cart page on the storefront-cart drop-in, after blocks/commerce-cart of
 * aem-boilerplate-commerce (June 2026 state). Left out: wishlist, gift options, gift cards and the
 * mini PDP edit modal. Checkout is not part of this lab, so no checkout route is given.
 *
 * Block options (key / value rows, all optional), same names as the boilerplate:
 * hide-heading, max-items, hide-attributes, enable-item-quantity-update, enable-item-remove,
 * enable-estimate-shipping, start-shopping-url, checkout-url, undo-remove-item.
 */
import { events } from '@dropins/tools/event-bus.js';
import { render as provider } from '@dropins/storefront-cart/render.js';
import CartSummaryList from '@dropins/storefront-cart/containers/CartSummaryList.js';
import OrderSummary from '@dropins/storefront-cart/containers/OrderSummary.js';
import EstimateShipping from '@dropins/storefront-cart/containers/EstimateShipping.js';
import Coupons from '@dropins/storefront-cart/containers/Coupons.js';

import '../../scripts/initializers/cart.js';

import { readBlockConfig } from '../../scripts/aem.js';
import {
  rootLink,
  getProductLink,
  renderCartItemPromotions,
} from '../../scripts/commerce.js';

export default async function decorate(block) {
  const {
    'hide-heading': hideHeading = 'false',
    'max-items': maxItems,
    'hide-attributes': hideAttributes = '',
    'enable-item-quantity-update': enableUpdateItemQuantity = 'true',
    'enable-item-remove': enableRemoveItem = 'true',
    'enable-estimate-shipping': enableEstimateShipping = 'false',
    'start-shopping-url': startShoppingURL = '/',
    'checkout-url': checkoutURL = '',
    'undo-remove-item': undo = 'false',
  } = readBlockConfig(block);

  const fragment = document.createRange().createContextualFragment(`
    <div class="cart__notification"></div>
    <div class="cart__wrapper">
      <div class="cart__left-column">
        <div class="cart__list"></div>
      </div>
      <div class="cart__right-column">
        <div class="cart__order-summary"></div>
      </div>
    </div>
  `);

  const $list = fragment.querySelector('.cart__list');
  const $summary = fragment.querySelector('.cart__order-summary');
  const $rightColumn = fragment.querySelector('.cart__right-column');

  block.replaceChildren(fragment);

  const createProductLink = (item) => getProductLink(item.url?.urlKey, item.topLevelSku);

  await Promise.all([
    provider.render(CartSummaryList, {
      hideHeading: hideHeading === 'true',
      routeProduct: createProductLink,
      routeEmptyCartCTA: startShoppingURL ? () => rootLink(startShoppingURL) : undefined,
      maxItems: parseInt(maxItems, 10) || undefined,
      attributesToHide: hideAttributes.split(',').map((attr) => attr.trim().toLowerCase()),
      enableUpdateItemQuantity: enableUpdateItemQuantity === 'true',
      enableRemoveItem: enableRemoveItem === 'true',
      undo: undo === 'true',
      slots: {
        Footer: (ctx) => renderCartItemPromotions(ctx),
      },
    })($list),

    provider.render(OrderSummary, {
      routeCheckout: checkoutURL ? () => rootLink(checkoutURL) : undefined,
      slots: {
        EstimateShipping: async (ctx) => {
          if (enableEstimateShipping === 'true') {
            const wrapper = document.createElement('div');
            await provider.render(EstimateShipping, {})(wrapper);
            ctx.replaceWith(wrapper);
          }
        },
        Coupons: (ctx) => {
          const coupons = document.createElement('div');
          provider.render(Coupons)(coupons);
          ctx.appendChild(coupons);
        },
      },
    })($summary),
  ]);

  events.on('cart/data', (cartData) => {
    const isEmpty = !cartData || cartData.totalQuantity < 1;
    $rightColumn.style.display = isEmpty ? 'none' : '';
  }, { eager: true });
}
