const checkbox = document.getElementById("enable");
const statusText = document.getElementById("status");

// Load saved state on open
chrome.storage.sync.get({ gesturesEnabled: false }, ({ gesturesEnabled }) => {
  checkbox.checked = gesturesEnabled;
  setStatus(gesturesEnabled);
});

checkbox.addEventListener("change", async () => {
  const enabled = checkbox.checked;
  chrome.storage.sync.set({ gesturesEnabled: enabled });
  setStatus(enabled);

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (
    tab !== null &&
    tab !== undefined &&
    typeof tab.id === "number" &&
    typeof tab.url === "string" &&
    /^https?:\/\/(?:www\.)?youtube\.com/.test(tab.url)
  ) {
    const message = { type: "GESTURES_ENABLED", value: enabled };
    chrome.tabs.sendMessage(tab.id, message);
  }
});

function setStatus(enabled) {
  if (enabled) {
    statusText.textContent = "Gestures are ON";
  } else {
    statusText.textContent = "Gestures are OFF";
  }
  statusText.classList.toggle("muted", !enabled);
}
