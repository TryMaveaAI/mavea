// The probe calls this through the worker: ask the content script in the app's tab.
self.probeCollect = async (needle, origin) => {
  const tabs = await chrome.tabs.query({});
  const tab = tabs.find((t) => t.url?.startsWith(origin));
  if (!tab?.id) return { error: 'no tab on the app origin' };
  return chrome.tabs.sendMessage(tab.id, { cmd: 'collect', needle });
};
