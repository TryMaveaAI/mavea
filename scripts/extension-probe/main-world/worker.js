// The probe calls this through the worker: run the collector the main-world script defined.
self.probeCollect = async (needle, origin) => {
  const tabs = await chrome.tabs.query({});
  const tab = tabs.find((t) => t.url?.startsWith(origin));
  if (!tab?.id) return { error: 'no tab on the app origin' };
  const [injection] = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    world: 'MAIN',
    func: (n) => extensionProbeCollect(n),
    args: [needle],
  });
  return injection?.result ?? { error: 'no result' };
};
