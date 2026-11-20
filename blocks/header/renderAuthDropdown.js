/*
 * "Mon compte" / "Espace Pro" in the header, after blocks/header/renderAuthDropdown.js of
 * aem-boilerplate-commerce (April 2026 suite state). Signed out: the button opens a panel with the
 * storefront-auth SignIn container. Signed in: the panel links to the account and signs out.
 * Labels come from placeholders (Global.*), the button keeps the site label.
 */
import { getCookie } from '@dropins/tools/lib.js';
import * as authApi from '@dropins/storefront-auth/api.js';
import { render as authRenderer } from '@dropins/storefront-auth/render.js';
import { SignIn } from '@dropins/storefront-auth/containers/SignIn.js';
import {
  CUSTOMER_ACCOUNT_PATH,
  CUSTOMER_FORGOTPASSWORD_PATH,
  CUSTOMER_PATH,
  ORDER_DETAILS_PATH,
  fetchPlaceholders,
  rootLink,
} from '../../scripts/commerce.js';
import { el } from '../../scripts/dom.js';

function handleLogout(redirections) {
  const target = Object.entries(redirections)
    .find(([currentPath]) => window.location.pathname.includes(currentPath));
  if (target) {
    const [, redirectPath] = target;
    window.location.href = redirectPath;
  } else window.location.reload();
}

/**
 * @param {Element} tools nav tools container
 * @param {{ label: string, icon: Element }} options button label (site wording) and icon
 */
export default async function renderAuthDropdown(tools, { label, icon }) {
  const labels = (await fetchPlaceholders('placeholders/auth.json'))?.Global || {};
  const panelId = 'nav-auth-panel';
  const button = el(
    'button',
    {
      type: 'button', class: 'button primary nav-account', 'aria-haspopup': 'dialog', 'aria-expanded': 'false', 'aria-controls': panelId,
    },
    icon,
    el('span', { class: 'nav-account-label' }, label),
  );
  const signIn = el('div', { class: 'nav-auth-signin' });
  const accountLink = el('a', { href: rootLink(CUSTOMER_ACCOUNT_PATH) }, labels.MyAccount || 'My account');
  const logout = el('button', { type: 'button', class: 'nav-auth-logout' }, labels.SignOut || 'Sign out');
  const menu = el('ul', { class: 'nav-auth-menu' }, el('li', {}, accountLink), el('li', {}, logout));
  const panel = el('div', {
    class: 'nav-auth-panel', id: panelId, role: 'dialog', 'aria-label': label, hidden: true,
  }, signIn, menu);
  const wrapper = el('div', { class: 'nav-auth' }, button, panel);
  tools.prepend(wrapper);

  const toggle = (open) => {
    panel.hidden = !open;
    button.setAttribute('aria-expanded', String(open));
  };
  button.addEventListener('click', () => toggle(panel.hidden));
  document.addEventListener('click', (e) => {
    if (!panel.hidden && !wrapper.contains(e.target)) toggle(false);
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !panel.hidden) {
      toggle(false);
      button.focus();
    }
  });

  logout.addEventListener('click', async () => {
    await authApi.revokeCustomerToken();
    handleLogout({
      '/checkout': rootLink('/cart'),
      [CUSTOMER_PATH]: rootLink('/customer/login'),
      [ORDER_DETAILS_PATH]: rootLink('/'),
    });
  });

  authRenderer.render(SignIn, {
    onSuccessCallback: () => window.location.reload(),
    formSize: 'small',
    routeForgotPassword: () => rootLink(CUSTOMER_FORGOTPASSWORD_PATH),
    routeSignUp: () => rootLink('/customer/create'),
  })(signIn);

  const signedIn = !!getCookie('auth_dropin_user_token');
  const firstName = getCookie('auth_dropin_firstname');
  signIn.hidden = signedIn;
  menu.hidden = !signedIn;
  if (signedIn && firstName) {
    button.querySelector('.nav-account-label').textContent = (labels.Hello || 'Hello {name}').replace('{name}', firstName);
  }
}
