// Runs in the PAGE's main world (manifest content_scripts world: "MAIN") so it can reach the
// trade app's Vue store, which the extension's isolated content script cannot see. It answers
// two messages from the content script via window.postMessage:
//   - 'get-query'  : hand back the current search query (read-only).
//   - 'apply-stats': merge stat filters into the live search and click the trade site's own
//                    Search button — an in-place search (one request, no full-page reload).
// Driving the native search this way avoids POSTing our own search AND navigating to it, which
// made the trade site re-run the search on load = two search requests per Apply (the extra one
// could be rate-limited, blanking the results). If anything is missing it reports failure so the
// content script falls back to the API path.
(function () {
  function getStore() {
    return document.querySelector('#trade').__vue__.$store;
  }

  function readQuery() {
    try {
      return JSON.parse(JSON.stringify(getStore().state.persistent));
    } catch (error) {
      return null;
    }
  }

  function applyStats(filters, removeIds) {
    var persistent = getStore().state.persistent;

    // Merge into a clone of the existing stats (keeping the user's own filters, plus type /
    // term / name / other filters untouched), then assign the array back — replacing it is what
    // the Vue store reliably reacts to.
    var stats = JSON.parse(JSON.stringify(persistent.stats || []));
    var andGroup = null;
    for (var i = 0; i < stats.length; i++) {
      if (stats[i].type === 'and') {
        andGroup = stats[i];
        break;
      }
    }
    if (!andGroup) {
      andGroup = {type: 'and', filters: []};
      stats.unshift(andGroup);
    }

    // Drop the stats whose control was unticked, so unchecking a mod removes its filter.
    var remove = removeIds || [];
    if (remove.length) {
      andGroup.filters = andGroup.filters.filter(function (f) {
        return remove.indexOf(f.id) === -1;
      });
    }

    (filters || []).forEach(function (filter) {
      var existing = null;
      for (var j = 0; j < andGroup.filters.length; j++) {
        if (andGroup.filters[j].id === filter.id) {
          existing = andGroup.filters[j];
          break;
        }
      }
      if (existing) {
        existing.value = filter.value;
        existing.disabled = false;
      } else {
        andGroup.filters.push({id: filter.id, value: filter.value, disabled: false});
      }
    });

    persistent.stats = stats;

    var searchButton = document.querySelector('#trade .search-btn');
    if (!searchButton) throw new Error('search button not found');
    searchButton.click();
  }

  window.addEventListener('message', function (event) {
    if (event.source !== window) return;
    var data = event.data;
    if (!data) return;

    if (data.__btBridge === 'get-query') {
      window.postMessage({__btBridge: 'query', requestId: data.requestId, query: readQuery()}, '*');
    } else if (data.__btBridge === 'apply-stats') {
      var ok = false;
      try {
        applyStats(data.filters, data.removeIds);
        ok = true;
      } catch (error) {
        ok = false;
      }
      window.postMessage({__btBridge: 'apply-done', requestId: data.requestId, ok: ok}, '*');
    }
  });
})();
