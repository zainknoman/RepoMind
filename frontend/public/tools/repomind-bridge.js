// Storage and navigation bridge for RepoMind's embedded tools.
//
// Inside RepoMind the tools run in sandboxed iframes with an opaque origin, so they cannot touch the
// app's localStorage or navigate the top window. Instead they ask the parent page through postMessage;
// the parent only honours an allowlist of keys and actions. Opened standalone, the bridge falls back
// to this page's own localStorage.
(function () {
  var embedded = window.parent !== window;
  var snapshot = null;
  var parentOrigin = null;
  var waiting = [];

  function flush() {
    waiting.splice(0).forEach(function (cb) {
      cb();
    });
  }
  function send(message) {
    if (parentOrigin) window.parent.postMessage(message, parentOrigin);
  }

  window.RepoMindBridge = {
    ready: function (cb) {
      if (!embedded || snapshot) cb();
      else waiting.push(cb);
    },
    get: function (key) {
      if (!embedded) {
        try {
          return localStorage.getItem(key);
        } catch (e) {
          return null;
        }
      }
      return snapshot && Object.prototype.hasOwnProperty.call(snapshot, key) ? snapshot[key] : null;
    },
    set: function (key, value) {
      if (!embedded) return localStorage.setItem(key, value);
      if (snapshot) snapshot[key] = value;
      send({ type: 'repomind:storage-set', key: key, value: value });
    },
    remove: function (key) {
      if (!embedded) return localStorage.removeItem(key);
      if (snapshot) delete snapshot[key];
      send({ type: 'repomind:storage-remove', key: key });
    },
    openTool: function (tool) {
      if (!embedded) {
        window.location.assign('../?tool=' + encodeURIComponent(tool));
        return;
      }
      send({ type: 'repomind:open-tool', tool: tool });
    },
  };

  if (embedded) {
    window.addEventListener('message', function (event) {
      if (event.source !== window.parent) return;
      var data = event.data || {};
      if (data.type !== 'repomind:storage-snapshot') return;
      parentOrigin = event.origin;
      snapshot = Object.assign({}, data.values || {});
      flush();
    });
    // No data travels with this message, so the wildcard target is safe; replies are pinned to the
    // origin that answers.
    window.parent.postMessage({ type: 'repomind:bridge-ready' }, '*');
  }
})();
