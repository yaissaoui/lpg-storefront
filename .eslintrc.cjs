module.exports = {
  root: true,
  extends: 'airbnb-base',
  env: {
    browser: true,
  },
  parser: '@babel/eslint-parser',
  parserOptions: {
    allowImportExportEverywhere: true,
    sourceType: 'module',
    requireConfigFile: false,
  },
  rules: {
    'import/extensions': ['error', { js: 'always' }], // require js file extensions in imports
    'linebreak-style': ['error', 'unix'], // enforce unix linebreaks
    'no-param-reassign': [2, { props: false }], // allow modifying properties of param
    // Same relaxations as aem-boilerplate-commerce v12.0.0 for drop-in code
    'import/prefer-default-export': 'off',
    'import/no-cycle': 'off',
    'no-use-before-define': [2, { functions: false }],
    'no-console': ['error', { allow: ['warn', 'error', 'info', 'debug'] }],
    'no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    'no-underscore-dangle': 'off',
  },
  overrides: [
    {
      // Node side: unit tests and the local dev proxy.
      files: ['test/**/*.js', 'tools/**/*.mjs', 'build.mjs', 'postinstall.js'],
      env: { node: true, browser: false },
      rules: {
        'import/extensions': ['error', { js: 'always', mjs: 'always' }],
        'import/no-extraneous-dependencies': 'off',
        'no-console': 'off',
      },
    },
  ],
};
