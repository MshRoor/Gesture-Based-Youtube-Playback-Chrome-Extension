import * as vision from "./vendor/mediapipe/vision_bundle.mjs";

const WASM_BASE = new URL("./vendor/mediapipe/wasm/", import.meta.url).href;
const MODEL_URL = new URL("./vendor/mediapipe/hand_landmarker.task", import.meta.url).href;

let landmarker = null;
let running = false;
let video = null;
let timerId = 0;

function postCount(res) {
  const count = Array.isArray(res?.landmarks) ? res.landmarks.length : 0;
  parent.postMessage({ source: "YGCP-IFR", type: "HAND_COUNT", count }, "*");
}

async function ensureSetup() {
  if (landmarker) return;
  const fileset = await vision.FilesetResolver.forVisionTasks(WASM_BASE);

  // ← KEY CHANGE: use VIDEO mode and no resultCallback
  landmarker = await vision.HandLandmarker.createFromOptions(fileset, {
    baseOptions: { modelAssetPath: MODEL_URL },
    runningMode: "VIDEO",
    numHands: 1,
    minHandDetectionConfidence: 0.2,
    minHandPresenceConfidence: 0.2,
    minTrackingConfidence: 0.2,
  });
}

function tick() {
  if (!running) return;
  try {
    if (video && video.readyState >= 2) {
      const res = landmarker.detectForVideo(video, performance.now());
      postCount(res);
    }
  } catch (err) {
    parent.postMessage({ source: "YGCP-IFR", type: "ERROR", error: String(err) }, "*");
  } finally {
    // drive it with a steady timer (20 fps)
    timerId = setTimeout(tick, 25);
  }
}

async function start() {
  if (running) return;
  await ensureSetup();

  // (re)create video and (re)attach stream as needed
  if (!video) {
    video = document.createElement("video");
    video.autoplay = true;
    video.muted = true;
    video.playsInline = true;

    // (optional) append off-screen so some browsers keep it active
    Object.assign(video.style, {
      position: "fixed", left: "-9999px", top: "-9999px", width: "1px", height: "1px", opacity: "0",
    });
    document.body.appendChild(video);
  }
  if (!video.srcObject) {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 30 }, facingMode: "user" },
      audio: false,
    });
    video.srcObject = stream;
    await video.play();
    Object.assign(video.style, {
        position: "fixed",
        left: "-9999px",
        top: "-9999px",
        width: "2px",
        height: "2px",
        opacity: "0",
        pointerEvents: "none",
        });
        if (!video.isConnected) document.body.appendChild(video);
  }

  running = true;
  parent.postMessage({ source: "YGCP-IFR", type: "READY" }, "*");
  tick();
}

function stop() {
  running = false;
  if (timerId) clearTimeout(timerId), (timerId = 0);
  if (video?.srcObject) {
    for (const t of video.srcObject.getTracks()) t.stop();
  }
  if (video) {
    video.srcObject = null;
    // leave element around; we’ll reuse it on next start
  }
}

window.addEventListener("message", (e) => {
  const msg = e?.data;
  if (!msg) return;
  if (msg.type === "START") start().catch(err =>
    parent.postMessage({ source: "YGCP-IFR", type: "ERROR", error: String(err) }, "*")
  );
  if (msg.type === "STOP") {
    stop();
    parent.postMessage({ source: "YGCP-IFR", type: "STOPPED" }, "*");
  }
});

// alive ping
parent.postMessage({ source: "YGCP-IFR", type: "BOOTED" }, "*");
