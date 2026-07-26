import { PoseEngine } from "./pose/pose-engine";
import { checkFrame, type PoseWorldLandmark } from "./form-checker/form-checker";
import { drawOverlay } from "./render/live-overlay";
import { ReplayView } from "./render/replay-view";
import { summarizeSession, renderProgressSummary } from "./render/progress-chart";
import { SessionStore, type SessionFrameRecord } from "./storage/session-store";
import { exerciseLibrary } from "./exercise-library";
import { loadOverrides } from "./exercise-library/overrides";
import { renderRuleSettings } from "./render/rule-settings";

/** Per-rule angle range + pass/coverage stats, dumped to console at session end for review. */
function buildRuleStats(frames: SessionFrameRecord[]) {
  const stats: Record<string, { minAngle: number; maxAngle: number; passed: number; evaluated: number; total: number }> = {};

  for (const frame of frames) {
    for (const rule of frame.ruleResults) {
      const stat = (stats[rule.ruleName] ??= {
        minAngle: Infinity,
        maxAngle: -Infinity,
        passed: 0,
        evaluated: 0,
        total: 0
      });
      stat.total += 1;
      if (rule.evaluated) {
        stat.evaluated += 1;
        if (rule.passed) stat.passed += 1;
        if (rule.angleDegrees !== null) {
          stat.minAngle = Math.min(stat.minAngle, rule.angleDegrees);
          stat.maxAngle = Math.max(stat.maxAngle, rule.angleDegrees);
        }
      }
    }
  }

  return stats;
}

const capturedErrors: string[] = [];

window.onerror = (message, _source, _lineno, _colno, error) => {
  const text = `${message} ${error ?? ""}`;
  capturedErrors.push(text);
  console.error("[pt-form-tracker] uncaught error:", message, error ?? "");
};
window.onunhandledrejection = (event) => {
  capturedErrors.push(String(event.reason));
  console.error("[pt-form-tracker] unhandled rejection:", event.reason);
};

/** Dev-only: ships end-of-session diagnostics to the artifact-bridge Vite plugin. */
async function postTestArtifact(payload: unknown): Promise<void> {
  if (!import.meta.env.DEV) return;
  try {
    await fetch("/__test-artifact", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
  } catch {
    // Best-effort only; never block the session end flow on this.
  }
}

async function main() {
  const exercise = exerciseLibrary["squat"];
  const video = document.getElementById("camera-feed") as HTMLVideoElement;
  const canvas = document.getElementById("overlay-canvas") as HTMLCanvasElement;
  const ctx = canvas.getContext("2d")!;
  const replayContainer = document.getElementById("replay-container")!;
  const progressContainer = document.getElementById("progress-container")!;
  const framingInstructions = document.getElementById("framing-instructions")!;

  const framingLabel = exercise.requiredFraming === "side-view" ? "Stand side-on to the camera." : "Face the camera.";
  framingInstructions.textContent = `${framingLabel} ${exercise.referenceDescription}`;

  // Reference ranges are a general guideline, so the user can retune them for their
  // own body. Held mutable and read per-frame, so edits apply without a reload.
  const settingsContainer = document.getElementById("rule-settings")!;
  let overrides = loadOverrides(window.localStorage);
  renderRuleSettings(settingsContainer, exercise, overrides, window.localStorage, (next) => {
    overrides = next;
  });

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
      ? checkFrame(exercise, result.worldLandmarks[0] as PoseWorldLandmark[], overrides)
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
    const ruleStats = buildRuleStats(frames);
    console.table(ruleStats);
    await postTestArtifact({
      timestamp: new Date().toISOString(),
      exerciseId: exercise.id,
      frameCount: frames.length,
      summary,
      ruleStats,
      errors: capturedErrors
    });

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
