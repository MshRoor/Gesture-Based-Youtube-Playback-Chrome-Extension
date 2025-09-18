// Check that we are on a YouTube page and our script is running.
console.log("[YGCP] content.js loaded on", location.href);

// --- Gesture config (tweakable) ---
const ARM_ON_PRESENT_FRAMES = 10;  // ~0.5s if detector sends ~20 fps
const REARM_ON_ABSENT_FRAMES = 10; // ~0.5s of no hands to re-arm
const REQUIRED_HANDS = 1;          // use 2 if you want a two-hands gesture

// --- Gesture state ---
let gPresentStreak = 0;
let gAbsentStreak  = 0;
let gArmed         = true; // true = ready to trigger on next sustained-present

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

  if (ygcpGesturesEnabled) startCamera().catch(err => {
    console.warn("[YGCP] Camera start failed on init:", err);
  });
});

let camContainer = null;
let camVideoEl = null;
let camStream = null;

function ensureCamContainer() {
  if (camContainer && document.body.contains(camContainer)) return camContainer;
  const div = document.createElement("div");
  div.id = "ygcp-cam";               // styled by content.css
  const vid = document.createElement("video");
  vid.autoplay = true;
  vid.muted = true;                  // avoid feedback
  vid.playsInline = true;            // iOS-friendly
  div.appendChild(vid);
  document.body.appendChild(div);
  camContainer = div;
  camVideoEl = vid;
  return div;
}

let detectorFrame = null;
let detectorWin = null;
let detectorBooted = false;

function ensureDetectorIframe() {
  return new Promise((resolve) => {
    if (detectorWin) return resolve(detectorWin);
    const iframe = document.createElement("iframe");
    iframe.id = "ygcp-detector";
    iframe.style.display = "none";
    iframe.src = chrome.runtime.getURL("detector.html");

    iframe.allow = "camera; microphone";

    iframe.addEventListener("load", () => {
      detectorFrame = iframe;
      detectorWin = iframe.contentWindow;
      resolve(detectorWin);
    });
    document.documentElement.appendChild(iframe);
  });
}

let pageInjected = false;
function injectPageScriptsOnce() {
  if (pageInjected) return;
  pageInjected = true;
  chrome.runtime.sendMessage({ type: "INJECT_PAGE" }, (res) => {
    console.log("inject response", res);
  });
}


let handDetector = null;
let lastHandCount = -1;
let lastAnnounceTs = 0;

async function startCamera() {
  if (camStream) return; // already running
  ensureCamContainer();

  try {
    camStream = await navigator.mediaDevices.getUserMedia({
      video: { width: 640, height: 360, facingMode: "user" },
      audio: false
    });
  } catch (err) {
    flashOverlay("Camera: permission denied");
    console.error("[YGCP] getUserMedia error:", err);
    return;
  }

    camVideoEl.srcObject = camStream;
    await camVideoEl.play();
    camContainer.classList.add("show");
    flashOverlay("Camera: ON");
    console.log("[YGCP] Camera started.");

    if (ygcpGesturesEnabled) {
    const w = await ensureDetectorIframe();
    // if the iframe already booted we can START now; else BOOTED handler will do it
    if (detectorBooted) w.postMessage({ type: "START" }, "*")
  }
}

function stopCamera() {
  if (!camStream) return;
  for (const track of camStream.getTracks()) {
    track.stop();
  }
  camStream = null;
  if (camVideoEl) {
    camVideoEl.pause();
    camVideoEl.srcObject = null;
  }
  if (camContainer) camContainer.classList.remove("show");
  if (detectorWin) detectorWin.postMessage({ type: "STOP" }, "*");
}

// Helper: lazy-init the detector once
// async function ensureHandDetector() {
//   if (handDetector) return handDetector;
//   if (!window.YGCPDetector?.MpHandDetector) {
//     console.warn("[YGCP] MP Detector script missing");
//     return null;
//   }
//   const det = new YGCPDetector.MpHandDetector({ numHands: 2 });
//   det.onModelLoad = () => console.log("[YGCP] MediaPipe Hand model loaded.");
//   det.onError = (e) => console.warn("[YGCP] MP Detector error:", e);
//   det.onHandCount = (count) => {
//     // throttle overlay so we don't spam every frame
//     const now = Date.now();
//     if (count !== lastHandCount || now - lastAnnounceTs > 800) {
//       flashOverlay(`Hands: ${count}`);
//       lastHandCount = count;
//       lastAnnounceTs = now;
//     }
//   };

//   await det.init(camVideoEl);
//   handDetector = det;
//   return det;
// }

// Optional hygiene: stop camera if you leave the page or hide it for a while
window.addEventListener("pagehide", stopCamera);
document.addEventListener("visibilitychange", () => {
  // Keep this simple for now—don’t auto-stop on background, it can be annoying.
  // Later we can pause if hidden for > N seconds.
});

let pageBooted = false;
let lastCountTs = 0;

window.addEventListener("message", (e) => {
  const msg = e?.data;
  if (msg?.source !== "YGCP-IFR") return;

  if (msg.type === "BOOTED") {
    detectorBooted = true;
    console.log("[YGCP] iframe detector booted");
    if (ygcpGesturesEnabled && camStream) {
      detectorWin?.postMessage({ type: "START" }, "*");
    }
  } else if (msg.type === "READY") {
    console.log("[YGCP] MediaPipe Hand model loaded (iframe)");
    flashOverlay("Detector ready");
    startDebugTicker(); 

  } else if (msg.type === "HAND_COUNT") {
    const c = Number.isFinite(msg.count) ? msg.count : 0;
    latestHandCount = c; // for your debug ticker, keep this line if you added it
    console.log("[YGCP] HAND_COUNT:", c);

    // --- Simple one-shot gesture on sustained presence ---
    if (c >= REQUIRED_HANDS) {
      gPresentStreak++;
      gAbsentStreak = 0;

      if (gArmed && gPresentStreak >= ARM_ON_PRESENT_FRAMES) {
        // Fire once
        togglePlayPause();
        flashOverlay("Gesture: Toggle");
        gArmed = false;         // disarm until hands go away
        gPresentStreak = 0;     // reset present streak
      }
    } else {
      gAbsentStreak++;
      gPresentStreak = 0;

      if (!gArmed && gAbsentStreak >= REARM_ON_ABSENT_FRAMES) {
        gArmed = true;          // ready for next gesture
        
      }
    }

    const now = Date.now();
    if (now - lastCountTs > 500) {                          // ~2x/sec
      flashOverlay(`Hands: ${latestHandCount}`);
      lastCountTs = now;
    }
  } else if (msg.type === "ERROR") {
    console.warn("[YGCP] iframe detector error:", msg.error);
    flashOverlay("Detector error");
  }
});

chrome.runtime.onMessage.addListener((msg) => {
  if (msg !== null && msg !== undefined && msg.type === "GESTURES_ENABLED") {
    ygcpGesturesEnabled = Boolean(msg.value);
    if (ygcpGesturesEnabled) {
      flashOverlay("Gestures: ON");
    } else {
      flashOverlay("Gestures: OFF");
    }
    if (ygcpGesturesEnabled) {
      startCamera().then(() => startDebugTicker())
               .catch(err => console.warn("[YGCP] Camera start failed:", err));

      // Start detector if camera is already running
      // ensureHandDetector().then(det => det && det.start());
    } else {
      // if (handDetector) handDetector.stop();
      stopDebugTicker();
      stopCamera();
    }
  }

  if (msg !== null && msg !== undefined && msg.type === "TOGGLE_PLAY_PAUSE") {
  togglePlayPause();
  }

  if (msg !== null && msg !== undefined && msg.type === "TOGGLE_MUTE"){
    toggleMute();
  }
});

// Debug ticker state
let latestHandCount = 0;      // last value we heard from the iframe
let debugTicker = null;

const DEBUG_OVERLAY_EVERY_MS = 700;   // how often to show the overlay
const STALE_AFTER_MS = 1500;          // when to label it as stale

function startDebugTicker() {
  if (debugTicker) return;
  debugTicker = setInterval(() => {
    // Always repaint, even if it didn't change
    flashOverlay(`Hands: ${latestHandCount}`);
  }, 700); // adjust cadence if you like
}

function stopDebugTicker() {
  if (!debugTicker) return;
  clearInterval(debugTicker);
  debugTicker = null;
}

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

