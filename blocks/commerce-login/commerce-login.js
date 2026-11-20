import { SignIn } from '@dropins/storefront-auth/containers/SignIn.js';
import { render as authRenderer } from '@dropins/storefront-auth/render.js';
import {
  CUSTOMER_ACCOUNT_PATH,
  CUSTOMER_FORGOTPASSWORD_PATH,
  cartReadyAfterSignIn,
  checkIsAuthenticated,
  redirectAfterSignIn,
  rootLink,
} from '../../scripts/commerce.js';

// Initialize
import '../../scripts/initializers/auth.js';

export default async function decorate(block) {
  // ?redirect= (for example from the checkout when guest checkout is off) wins over the
  // boilerplate default, the account page. Only paths under the store root are accepted.
  const target = redirectAfterSignIn(rootLink(CUSTOMER_ACCOUNT_PATH));
  if (checkIsAuthenticated()) {
    window.location.href = target;
  } else {
    await authRenderer.render(SignIn, {
      routeForgotPassword: () => rootLink(CUSTOMER_FORGOTPASSWORD_PATH),
      // "Créer un compte" link (off by default in the drop-in and the boilerplate block)
      renderSignUpLink: true,
      routeSignUp: () => rootLink('/customer/create'),
      // Not routeRedirectOnSignIn: the drop-in would navigate at once, before the cart
      // drop-in has merged the guest cart into the customer cart. Navigate once it has.
      onSuccessCallback: async () => {
        await cartReadyAfterSignIn();
        window.location.href = target;
      },
    })(block);
  }
}
