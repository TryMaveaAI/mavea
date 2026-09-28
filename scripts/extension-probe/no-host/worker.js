// Everything an extension with no host permission might try against the app's origin. Every
// answer is a yes/no; nothing the key could be is returned.
self.probeCollect = async (needle, origin) => {
  const has = (text) => typeof text === 'string' && text.includes(needle);
  const out = {};

  const tabs = await chrome.tabs.query({});
  out.tabCount = tabs.length;
  out.tabUrlVisible = tabs.some((t) => t.url?.startsWith(origin));
  out.tabTitleVisible = tabs.some((t) => typeof t.title === 'string' && t.title.length > 0);

  out.scriptingApi = typeof chrome.scripting !== 'undefined';
  out.cookiesApi = typeof chrome.cookies !== 'undefined';
  out.injected = false;
  if (out.scriptingApi) {
    for (const tab of tabs) {
      try {
        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: () => localStorage.length,
        });
        out.injected = true;
      } catch {
        /* expected: no host permission */
      }
    }
  }

  out.messageAnswered = false;
  for (const tab of tabs) {
    try {
      await chrome.tabs.sendMessage(tab.id, { cmd: 'collect', needle });
      out.messageAnswered = true;
    } catch {
      /* no receiver: expected */
    }
  }

  // Without host permission the worker's fetch is a cross-origin request, and the app sends no
  // CORS grant, so the body must stay unreadable.
  out.originReadable = false;
  for (const path of ['/', '/index.html']) {
    try {
      const res = await fetch(origin + path);
      if (res.type !== 'opaque' && (await res.text()).length > 0) out.originReadable = true;
    } catch {
      /* CORS refusal: expected */
    }
  }

  out.ownStorageHasKey = has(JSON.stringify(await chrome.storage.local.get(null)));
  out.ownDatabases = (await indexedDB.databases()).map((d) => d.name);
  return out;
};
