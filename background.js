chrome.commands.onCommand.addListener(async (command) => {

  const tabsArray = await chrome.tabs.query({ active: true, currentWindow: true });
  console.log("[BG] tabsArray:", tabsArray);

  const [tab] = tabsArray;

  if (!tab || !tab.id || !tab.url) return;

  if (!/https?:\/\/(www\.)?youtube\.com/.test(tab.url)) return;

  if (command === "toggle-play-pause"){
    chrome.tabs.sendMessage(
      tab.id, 
    { 
      type: "TOGGLE_PLAY_PAUSE" 
    });
    console.log("[BG] PLAY-PAUSE Message sent to tab:", tab.id);
  }
  else if (command === "toggle-mute"){
    chrome.tabs.sendMessage(
      tab.id, 
    {
      type: "TOGGLE_MUTE"
    });
    console.log("[BG] MUTE Message sent to tab:", tab.id);
  }
});
