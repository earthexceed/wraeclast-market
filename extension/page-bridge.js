// Runs in the PAGE's main world (manifest content_scripts world: "MAIN") so it can read the
// trade app's Vue store, which the extension's isolated content script cannot see. On request
// it hands the current search query back via window.postMessage. Read-only — it never drives
// the UI. If anything is missing it replies with null so the content script falls back to the
// trade2 API. This lets Apply reuse the query the page already has instead of fetching it
// again (one fewer request, lighter on GGG's rate limit).
(function () {
  window.addEventListener('message', function (event) {
    if (event.source !== window) return;
    var data = event.data;
    if (!data || data.__btBridge !== 'get-query') return;

    var query = null;
    try {
      var persistent = document.querySelector('#trade').__vue__.$store.state.persistent;
      query = JSON.parse(JSON.stringify(persistent));
    } catch (error) {
      query = null;
    }

    window.postMessage({__btBridge: 'query', requestId: data.requestId, query: query}, '*');
  });
})();
