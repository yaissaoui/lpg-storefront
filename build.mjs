import { overrideGQLOperations } from '@dropins/build-tools/gql-extend.js';

// GraphQL fragment overrides for the drop-ins, applied to node_modules before
// postinstall.js copies them to scripts/__dropins__. Same mechanism as the Adobe
// commerce boilerplate (build.mjs).
//
// The boilerplate skips the downloadable fragments of the cart and order drop-ins
// because ACCS has no downloadable products. The LPG back end is a PaaS 2.4.7
// with the Storefront Compatibility Package, which knows these types, so nothing
// is skipped here. Calling the function with an empty list restores any
// fragments.original.js left by an earlier run.
overrideGQLOperations([]);
