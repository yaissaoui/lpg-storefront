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
  },
  overrides: [
    {
      // Node side: unit tests and the local dev proxy.
      files: ['test/**/*.js', 'tools/**/*.mjs'],
      env: { node: true, browser: false },
      rules: {
        'import/extensions': ['error', { js: 'always', mjs: 'always' }],
        'import/no-extraneous-dependencies': 'off',
        'no-console': 'off',
      },
    },
  ],
};
