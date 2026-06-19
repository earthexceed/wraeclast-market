/* eslint-env node */

'use strict';

const EmberApp = require('ember-cli/lib/broccoli/ember-app');
const targets = require('./config/targets');

// Node 22+ removed the long-deprecated util.is* type checkers, but this old toolchain's
// production CSS minifier (clean-css) still calls util.isRegExp. Polyfill the legacy set so
// `ember build --environment production` runs on modern Node (the machine here is Node 24).
const util = require('util');
const legacyTypeChecks = {
  isArray: (v) => Array.isArray(v),
  isBoolean: (v) => typeof v === 'boolean',
  isBuffer: (v) => Buffer.isBuffer(v),
  isDate: (v) => v instanceof Date,
  isError: (v) => v instanceof Error,
  isFunction: (v) => typeof v === 'function',
  isNull: (v) => v === null,
  isNullOrUndefined: (v) => v == null,
  isNumber: (v) => typeof v === 'number',
  isObject: (v) => typeof v === 'object' && v !== null,
  isPrimitive: (v) => v === null || (typeof v !== 'object' && typeof v !== 'function'),
  isRegExp: (v) => v instanceof RegExp,
  isString: (v) => typeof v === 'string',
  isSymbol: (v) => typeof v === 'symbol',
  isUndefined: (v) => v === undefined,
};
for (const [name, fn] of Object.entries(legacyTypeChecks)) {
  if (typeof util[name] !== 'function') util[name] = fn;
}

const IS_TEST_ENVIRONMENT = EmberApp.env() === 'test';

module.exports = function (defaults) {
  const app = new EmberApp(defaults, {
    hinting: false,
    storeConfigInMeta: false,
    tests: IS_TEST_ENVIRONMENT,

    'ember-cli-uglify': {
      enabled: false,
    },

    vendorFiles: {
      'jquery.js': null,
    },

    autoprefixer: {
      browsers: targets.browsers,
      sourcemap: false,
    },

    cssModules: {
      intermediateOutputPath: 'app/styles/_pods.scss',
      extension: 'module.scss',
      postcssOptions: {
        syntax: require('postcss-scss'),
      },
    },

    babel: {
      plugins: [require('ember-auto-import/babel-plugin'), 'transform-object-rest-spread'],
      sourceMaps: 'inline',
    },

    'ember-cli-babel': {
      includePolyfill: true,
    },

    // Chromium forbids the use of eval in browser extensions as of Manifest v3.
    // This setting causes ember-auto-import to avoid webpack source map settings
    // which would implicitly use eval in built versions of the app.
    autoImport: {
      forbidEval: true,
    },

    sourcemaps: {
      enabled: !IS_TEST_ENVIRONMENT,
    },

    fingerprint: {
      enabled: false,
    },
  });

  return app.toTree();
};
