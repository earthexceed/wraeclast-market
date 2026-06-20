/* eslint-env node */

const fs = require('fs');
const path = require('path');
const [target] = process.argv.slice(2);

const outputDir = {
  dev: './dist/dev',
  production: './dist/staged',
}[target];

const packageJson = JSON.parse(fs.readFileSync('./package.json'));

const assetsPathFor = (assetsRelativePath) => {
  const path = `assets/${assetsRelativePath}`;

  if (target === 'production') return path;
  return `ember-build/${path}`;
};

const manifest = Object.assign(
  {
    version: packageJson.version,
    manifest_version: 3,
    content_scripts: [
      {
        matches: ['*://www.pathofexile.com/trade*', '*://pathofexile.com/trade*'],
        js: [assetsPathFor('vendor.js'), assetsPathFor('better-trading.js')],
        css: [assetsPathFor('vendor.css'), assetsPathFor('better-trading.css')],
      },
      {
        // Main-world bridge: reads the trade app's Vue store and relays the current search
        // query to the isolated content script (which can't access page JS). See page-bridge.js.
        matches: ['*://www.pathofexile.com/trade*', '*://pathofexile.com/trade*'],
        js: ['page-bridge.js'],
        world: 'MAIN',
      },
    ],
    background: {
      service_worker: 'background.js',
    },
    permissions: ['storage'],
    host_permissions: ['*://poe.ninja/*'],
    web_accessible_resources: [
      {
        resources: [assetsPathFor('images/*')],
        matches: ['*://www.pathofexile.com/*', '*://pathofexile.com/*'],
      },
    ],
    icons: {
      16: 'icon16.png',
      48: 'icon48.png',
      64: 'icon64.png',
      128: 'icon128.png',
    },
  },
  packageJson.manifest
);

fs.mkdirSync(outputDir, {recursive: true});
for (const file of fs.readdirSync('./extension')) {
  fs.copyFileSync(path.join('./extension', file), path.join(outputDir, file));
}
fs.writeFileSync(path.join(outputDir, 'manifest.json'), JSON.stringify(manifest, null, 2));
