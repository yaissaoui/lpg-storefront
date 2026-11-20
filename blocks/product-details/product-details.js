/*
 * Product details (PDP) on the storefront-pdp drop-in, after blocks/product-details of
 * aem-boilerplate-commerce (June 2026 state). Wishlist, gift card and customizable options
 * are left out.
 *
 * Catalogue: ACO through scripts/initializers/pdp.js (sku from <meta name="sku">,
 * /products/{urlKey}/{sku} or an ACO lookup of the url_key of /products/{urlKey}).
 * Cart: storefront-cart on the PaaS core GraphQL.
 *
 * Views that do not sell (LPG fr, en: sites.json "sells": false) render no price, no
 * quantity and no add to cart. They show the store locator and the pro shop links instead.
 */
import {
  InLineAlert,
  Icon,
  Button,
  provider as UI,
} from '@dropins/tools/components.js';
import { h } from '@dropins/tools/preact.js';
import { events } from '@dropins/tools/event-bus.js';
import * as pdpApi from '@dropins/storefront-pdp/api.js';
import { render as pdpRendered } from '@dropins/storefront-pdp/render.js';

import ProductHeader from '@dropins/storefront-pdp/containers/ProductHeader.js';
import ProductPrice from '@dropins/storefront-pdp/containers/ProductPrice.js';
import ProductShortDescription from '@dropins/storefront-pdp/containers/ProductShortDescription.js';
import ProductOptions from '@dropins/storefront-pdp/containers/ProductOptions.js';
import ProductQuantity from '@dropins/storefront-pdp/containers/ProductQuantity.js';
import ProductDescription from '@dropins/storefront-pdp/containers/ProductDescription.js';
import ProductAttributes from '@dropins/storefront-pdp/containers/ProductAttributes.js';
import ProductGallery from '@dropins/storefront-pdp/containers/ProductGallery.js';

import { fetchPlaceholders, rootLink } from '../../scripts/commerce.js';
import { getSiteContext } from '../../scripts/site-config.js';
import { IMAGES_SIZES } from '../../scripts/initializers/pdp.js';

function setMeta(name, content, attr = 'name') {
  if (!content) return;
  let meta = document.head.querySelector(`meta[${attr}="${name}"]`);
  if (!meta) {
    meta = document.createElement('meta');
    meta.setAttribute(attr, name);
    document.head.append(meta);
  }
  meta.setAttribute('content', content);
}

function link(href, text, className) {
  const a = document.createElement('a');
  a.href = href;
  a.textContent = text;
  if (className) a.className = className;
  return a;
}

/** Showcase mode (LPG institutional views): where to find the product instead of a price. */
function renderShowcase(container, ctx, labels) {
  if (ctx.site.storeLocatorPath) {
    const p = document.createElement('p');
    p.append(link(ctx.url(ctx.site.storeLocatorPath), labels.Global?.StoreLocator, 'button primary'));
    container.append(p);
  }
  const pro = ctx.locales.find((l) => l.professional && l.lang === ctx.lang);
  if (pro) {
    const p = document.createElement('p');
    p.className = 'product-details__pro-link';
    p.append(link(ctx.localeUrl(pro), labels.Global?.ProShop));
    container.append(p);
  }
}

export default async function decorate(block) {
  const [labels, ctx] = await Promise.all([fetchPlaceholders(), getSiteContext()]);
  const eventProduct = events.lastPayload('pdp/data') ?? null;
  let product = eventProduct?.sku ? eventProduct : null;

  if (!product) {
    const p = document.createElement('p');
    p.className = 'product-details__not-found';
    p.setAttribute('role', 'status');
    p.textContent = labels.Global?.ProductNotFound || 'Product not found';
    block.replaceChildren(p);
    return;
  }

  block.classList.toggle('product-details--showcase', !ctx.sells);

  const fragment = document.createRange().createContextualFragment(`
    <div class="product-details__alert"></div>
    <div class="product-details__wrapper">
      <div class="product-details__left-column">
        <div class="product-details__gallery"></div>
      </div>
      <div class="product-details__right-column">
        <div class="product-details__header"></div>
        <div class="product-details__price"></div>
        <div class="product-details__gallery"></div>
        <div class="product-details__short-description"></div>
        <div class="product-details__configuration">
          <div class="product-details__options"></div>
          <div class="product-details__quantity"></div>
          <div class="product-details__buttons"></div>
          <div class="product-details__add-to-cart-status" role="status" aria-live="polite"></div>
        </div>
        <div class="product-details__description"></div>
        <div class="product-details__attributes"></div>
      </div>
    </div>
  `);

  const $alert = fragment.querySelector('.product-details__alert');
  const $gallery = fragment.querySelector('.product-details__left-column .product-details__gallery');
  const $galleryMobile = fragment.querySelector('.product-details__right-column .product-details__gallery');
  const $header = fragment.querySelector('.product-details__header');
  const $price = fragment.querySelector('.product-details__price');
  const $shortDescription = fragment.querySelector('.product-details__short-description');
  const $options = fragment.querySelector('.product-details__options');
  const $quantity = fragment.querySelector('.product-details__quantity');
  const $buttons = fragment.querySelector('.product-details__buttons');
  const $status = fragment.querySelector('.product-details__add-to-cart-status');
  const $description = fragment.querySelector('.product-details__description');
  const $attributes = fragment.querySelector('.product-details__attributes');

  block.replaceChildren(fragment);

  const gallery = (controls, peak) => pdpRendered.render(ProductGallery, {
    controls,
    arrows: true,
    peak,
    gap: 'small',
    loop: false,
    imageParams: { ...IMAGES_SIZES },
  });

  await Promise.all([
    gallery('dots', false)($galleryMobile),
    gallery('thumbnailsColumn', true)($gallery),
    pdpRendered.render(ProductHeader, {})($header),
    ctx.sells ? pdpRendered.render(ProductPrice, {})($price) : null,
    pdpRendered.render(ProductShortDescription, {})($shortDescription),
    // Options stay visible in showcase mode: the colours are product information.
    pdpRendered.render(ProductOptions, { hideSelectedValue: false })($options),
    ctx.sells ? pdpRendered.render(ProductQuantity, {})($quantity) : null,
    pdpRendered.render(ProductDescription, {})($description),
    pdpRendered.render(ProductAttributes, {})($attributes),
  ]);

  const applyMeta = (data) => {
    if (!data?.sku) return;
    document.title = data.metaTitle || data.name || document.title;
    setMeta('description', data.metaDescription);
    setMeta('og:title', data.metaTitle || data.name, 'property');
  };
  applyMeta(product);

  if (!ctx.sells) {
    renderShowcase($buttons, ctx, labels);
    events.on('pdp/data', applyMeta, { eager: false });
    return;
  }

  let inlineAlert = null;
  let isOutOfStock = product.inStock === false;
  const label = labels.Global?.AddProductToCart || 'Add to cart';
  const getProductName = () => product?.name || product?.sku;

  const showAlert = async (type, heading, description) => {
    inlineAlert?.remove();
    inlineAlert = await UI.render(InLineAlert, {
      heading,
      description,
      type,
      icon: h(Icon, { source: type === 'success' ? 'CheckWithCircle' : 'Warning' }),
      'aria-live': 'assertive',
      role: 'alert',
      onDismiss: () => inlineAlert?.remove(),
    })($alert);
  };

  const addToCart = await UI.render(Button, {
    'aria-label': `${label} ${getProductName()}`,
    children: label,
    icon: h(Icon, { source: 'Cart' }),
    disabled: isOutOfStock,
    onClick: async () => {
      const busy = labels.Global?.AddingToCart || label;
      try {
        addToCart.setProps((prev) => ({ ...prev, children: busy, disabled: true }));
        $status.textContent = busy;
        const values = pdpApi.getProductConfigurationValues();
        if (pdpApi.isProductConfigurationValid()) {
          const { addProductsToCart } = await import('@dropins/storefront-cart/api.js');
          await addProductsToCart([{ ...values }]);
          await showAlert('success', labels.Global?.AddedToCart);
          const viewCart = link(rootLink('/cart'), labels.Global?.ViewCart);
          viewCart.className = 'product-details__view-cart';
          $alert.append(viewCart);
        }
      } catch (error) {
        await showAlert('error', 'Error', error.message);
        $alert.scrollIntoView({ behavior: 'smooth', block: 'center' });
      } finally {
        addToCart.setProps((prev) => ({ ...prev, children: label, disabled: isOutOfStock }));
        $status.textContent = '';
      }
    },
  })($buttons);

  events.on('pdp/data', (data) => {
    product = data?.sku ? data : product;
    applyMeta(product);
    isOutOfStock = data?.inStock === false;
    addToCart.setProps((prev) => ({ ...prev, disabled: isOutOfStock }));
  }, { eager: true });

  events.on('pdp/valid', (valid) => {
    addToCart.setProps((prev) => ({ ...prev, disabled: isOutOfStock || !valid }));
  }, { eager: true });
}
