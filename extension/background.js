var extensionApi;

if (typeof browser !== 'undefined') extensionApi = browser;
else if (typeof chrome !== 'undefined') extensionApi = chrome;

if (!extensionApi) throw new Error('extension API not found. Both `chrome` and `browser` are undefined.');

extensionApi.runtime.onMessage.addListener(function(request, sender, sendResponse) {
  if (request.query === 'poe-ninja') {
    fetch('https://poe.ninja/api' + request.resource)
      .then(function(response) { return response.json() })
      .then(function(payload) { sendResponse(payload) })
      .catch(function(_error) { sendResponse(null) });

    return true;
  }

  if (request.query === 'poe-ninja-poe1') {
    fetch('https://poe.ninja/poe1/api/economy' + request.resource)
      .then(function(response) { return response.json() })
      .then(function(payload) { sendResponse(payload) })
      .catch(function(_error) { sendResponse(null) });

    return true;
  }

  if (request.query === 'poe-ninja-poe2') {
    fetch('https://poe.ninja/poe2/api/economy' + request.resource)
      .then(function(response) { return response.json() })
      .then(function(payload) { sendResponse(payload) })
      .catch(function(_error) { sendResponse(null) });

    return true;
  }
});

// On first install and on every update, open the changelog / "what's new" page in a new
// tab. chrome.tabs.create with a URL needs no extra permission, and the extension can open
// its own packaged page directly. changelog.html is shipped by scripts/scaffold-extension.js
// (it copies every file in extension/ into the build output).
extensionApi.runtime.onInstalled.addListener(function(details) {
  if (details.reason === 'install' || details.reason === 'update') {
    extensionApi.tabs.create({url: extensionApi.runtime.getURL('changelog.html')});
  }
});
