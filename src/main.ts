import { PoseEngine } from "./pose/pose-engine";
import { checkFrame, type PoseWorldLandmark } from "./form-checker/form-checker";
import { drawOverlay } from "./render/live-overlay";
import { ReplayView } from "./render/replay-view";
import { summarizeSession, renderProgressSummary } from "./render/progress-chart";
import { SessionStore, type SessionFrameRecord } from "./storage/session-store";
import { exerciseLibrary } from "./exercise-library";

async function main() {
  const exercise = exerciseLibrary["squat"];
  const video = document.getElementById("camera-feed") as HTMLVideoElement;
  const canvas = document.getElementById("overlay-canvas") as HTMLCanvasElement;
  const ctx = canvas.getContext("2d")!;
  const replayContainer = document.getElementById("replay-container")!;
  const progressContainer = document.getElementById("progress-container")!;

  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: true });
  } catch {
    document.body.innerHTML = "<p>Camera permission is required to use this tool.</p>";
    return;
  }
  video.srcObject = stream;
  await video.play();
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;

  const store = new SessionStore();
  await store.open();
  const sessionId = await store.startSession(exercise.id);

  const worldLandmarksHistory: PoseWorldLandmark[][] = [];

  const engine = new PoseEngine();
  await engine.init();
  engine.start(video, (result) => {
    const frameResult = result.worldLandmarks[0]
      ? checkFrame(exercise, result.worldLandmarks[0] as PoseWorldLandmark[], [])
      : null;

    drawOverlay(ctx, video, result, exercise, frameResult);

    if (frameResult && result.worldLandmarks[0]) {
      worldLandmarksHistory.push(result.worldLandmarks[0] as PoseWorldLandmark[]);
      const record: SessionFrameRecord = {
        sessionId,
        timestamp: Date.now(),
        ruleResults: frameResult.ruleResults
      };
      store.queueFrame(record);
    }
  });

  window.addEventListener("beforeunload", () => {
    engine.stop();
  });

  // Manual "end session" trigger for v1: a keyboard shortcut, since there's
  // no UI chrome specified in the spec beyond the core views.
  window.addEventListener("keydown", async (e) => {
    if (e.key !== "e") return;
    engine.stop();
    stream.getTracks().forEach((t) => t.stop());

    try {
      await store.flush();
    } catch {
      progressContainer.textContent =
        "Couldn't save this session — your browser's storage may be full or restricted.";
      return;
    }

    const frames = await store.getFramesForSession(sessionId);
    const summary = summarizeSession(frames);
    renderProgressSummary(progressContainer, summary);

    const replay = new ReplayView(replayContainer);
    let i = 0;
    const replayInterval = setInterval(() => {
      if (i >= worldLandmarksHistory.length) {
        clearInterval(replayInterval);
        return;
      }
      replay.showFrame(worldLandmarksHistory[i]);
      i += 1;
    }, 33);
  });
}

main();
