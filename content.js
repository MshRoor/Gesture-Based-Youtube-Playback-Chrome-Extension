// Check that we are on a YouTube page and our script is running.
console.log("[YGCP] content.js loaded on", location.href);

function getVideo() {
  return document.querySelector("video");
}

function togglePlayPause() {
  const video = getVideo();
  if (!video) return console.warn("[YGCP] No <video> element on page.");
  
  if(video.paused){
    video.play()
    console.log("[YGCP] Play");
    flashOverlay("Play");
  } else {
    video.pause();
    console.log("[YGCP] Pause");
    flashOverlay("Pause");
  }
}

function toggleMute() {
  const video = getVideo();
  if (!video) {
    return console.warn("[YGCP] No <video> element on page.");
  }

  video.muted = !video.muted;

  if (video.muted) {
    console.log("[YGCP] Muted");
  } else {
    console.log("[YGCP] Unmuted");
  }

  if (video.muted) {
    flashOverlay("Muted");
  } else {
    flashOverlay("Unmuted");
  }

}

// Track gesture mode dummy value
let ygcpGesturesEnabled = false;

// Initialize from storage on load
chrome.storage.sync.get({ gesturesEnabled: false }, ({ gesturesEnabled }) => {
  ygcpGesturesEnabled = gesturesEnabled;
});

chrome.runtime.onMessage.addListener((msg) => {
  if (msg !== null && msg !== undefined && msg.type === "GESTURES_ENABLED") {
    ygcpGesturesEnabled = Boolean(msg.value);
    if (ygcpGesturesEnabled) {
      flashOverlay("Gestures: ON");
    } else {
      flashOverlay("Gestures: OFF");
    }
;
  }

  if (msg !== null && msg !== undefined && msg.type === "TOGGLE_PLAY_PAUSE") {
  togglePlayPause();
  }

  if (msg !== null && msg !== undefined && msg.type === "TOGGLE_MUTE"){
    toggleMute();
  }
});

let ygcpOverlay;

function ensureOverlay() {
  if (ygcpOverlay && document.body.contains(ygcpOverlay)) return ygcpOverlay;

  const el = document.createElement("div");
  el.id = "ygcp-overlay";
  el.textContent = "";
  document.body.appendChild(el);
  ygcpOverlay = el;
  return el;
}

function flashOverlay(text) {
  const el = ensureOverlay();
  el.textContent = text;
  el.classList.add("show");
  let hideTimer;
  clearTimeout(hideTimer);
  hideTimer = setTimeout(function () {
  el.classList.remove("show");
  }, 650);
}

