// Al clic sull'icona dell'estensione apre l'app in una nuova scheda,
// pre-compilando l'URL del canale se la scheda attiva e' gia' su YouTube.
chrome.action.onClicked.addListener((tab) => {
  let channel = "";
  const url = (tab && tab.url) || "";
  if (url.includes("youtube.com")) {
    channel = url;
  }
  const appUrl =
    chrome.runtime.getURL("app.html") +
    (channel ? "?channel=" + encodeURIComponent(channel) : "");
  chrome.tabs.create({ url: appUrl });
});
