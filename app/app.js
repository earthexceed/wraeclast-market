import Application from '@ember/application';
import Resolver from './resolver';
import loadInitializers from 'ember-load-initializers';
import config from './config/environment';

// When the extension is reloaded or auto-updated while a trade page is still
// open, this page's now-orphaned content script keeps reacting to DOM mutations
// and its background calls (chrome.*) throw "Extension context invalidated" on
// every mutation. The error is benign — the page just needs a refresh to pick up
// the new content script — but it otherwise spams the console/extension errors.
// Suppress only that specific, known-safe error; everything else surfaces normally.
const isExtensionContextInvalidated = (reason) =>
  Boolean(reason) && /Extension context invalidated/i.test(reason.message || String(reason));

// Once the context is gone, chrome.runtime.id is undefined (or throws on access). Some
// orphaned calls then fail with a plain TypeError that doesn't mention the invalidation —
// e.g. chrome.storage becomes undefined, so storage reads throw "Cannot read properties
// of undefined (reading 'local')". Detect the orphaned state directly so those variants
// are suppressed too; a healthy context always has a runtime id, so real errors surface.
const isContextOrphaned = () => {
  try {
    const api = typeof chrome !== 'undefined' ? chrome : typeof browser !== 'undefined' ? browser : null;
    return !(api && api.runtime && api.runtime.id);
  } catch (_error) {
    return true;
  }
};

const isOrphanError = (reason) => isExtensionContextInvalidated(reason) || isContextOrphaned();

window.addEventListener('unhandledrejection', (event) => {
  if (isOrphanError(event.reason)) event.preventDefault();
});
window.addEventListener('error', (event) => {
  if (isOrphanError(event.error || event.message)) event.preventDefault();
});

// Initialize the extension root container
const extensionContainer = document.createElement('div');
extensionContainer.id = 'better-trading-container';

// Check if the trading app is present (ie. not in maintenance)
if (document.querySelector('#trade')) {
  document.body.classList.add('bt-body');

  const isCollapsed = Boolean(window.localStorage.getItem('bt-side-panel-collapsed'));
  if (isCollapsed) document.body.classList.add('bt-is-collapsed');
} else {
  extensionContainer.style.display = 'none';
}

document.body.appendChild(extensionContainer);

const {modulePrefix, podModulePrefix} = config;
const App = Application.extend({
  rootElement: extensionContainer,
  modulePrefix,
  podModulePrefix,
  Resolver,
});

loadInitializers(App, modulePrefix);

export default App;
