/* eslint-env node */
// Build-time shim: the legacy `util.is*` helpers were removed in newer Node
// versions, but this old toolchain (ember-cli 3.14 / clean-css) still calls
// them during the production asset-minification step. Re-add the handful that
// the build touches so `make package-chrome` works on Node 18+.
const util = require('util');

const shims = {
  isRegExp: (value) => value instanceof RegExp,
  isDate: (value) => value instanceof Date,
  isBuffer: (value) => Buffer.isBuffer(value),
  isArray: (value) => Array.isArray(value),
  isError: (value) => value instanceof Error,
  isNullOrUndefined: (value) => value === null || value === undefined,
  isnull: (value) => value === null,
  isUndefined: (value) => value === undefined,
  isObject: (value) => value !== null && typeof value === 'object',
  isString: (value) => typeof value === 'string',
  isNumber: (value) => typeof value === 'number',
  isBoolean: (value) => typeof value === 'boolean',
  isFunction: (value) => typeof value === 'function',
  isPrimitive: (value) => value === null || (typeof value !== 'object' && typeof value !== 'function'),
};

for (const [name, fn] of Object.entries(shims)) {
  if (typeof util[name] !== 'function') util[name] = fn;
}
