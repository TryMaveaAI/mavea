// Answers the worker's collect request from inside the page's isolated world.
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.cmd !== 'collect') return false;
  extensionProbeCollect(message.needle).then(sendResponse, (error) =>
    sendResponse({ error: String(error) }),
  );
  return true; // the response is async
});
