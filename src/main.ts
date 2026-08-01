import { PoseEngine } from "./pose/pose-engine";
import { checkFrame, type PoseWorldLandmark } from "./form-checker/form-checker";
import { drawOverlay } from "./render/live-overlay";
import { ReplayView } from "./render/replay-view";
import { summarizeSession, renderProgressSummary } from "./render/progress-chart";
import { framesForRep, nextPlaybackFrame } from "./render/rep-player";
import { assessFraming } from "./form-checker/framing-check";
import { renderFramingReadout } from "./render/framing-readout";
import { SessionStore, type SessionFrameRecord } from "./storage/session-store";
import { exerciseLibrary } from "./exercise-library";
import { loadOverrides } from "./exercise-library/overrides";
import { renderRuleSettings } from "./render/rule-settings";
import { serializeLandmarks, RECORDED_LANDMARK_INDICES, LM_INDEX } from "./pose/landmark-recording";
import type { RecordedFrame } from "./pose/landmark-recording";
import { trunkSample, type TrunkSample } from "./pose/planar-measures";
import { assessCalibration, type CalibrationState } from "./form-checker/calibration";
import { handleSpacePress, tickCountdown, secondsRemaining } from "./form-checker/recording-countdown";
import { renderCalibrationReadout } from "./render/calibration-readout";
import { PositionSmoother } from "./pose/smoothing";

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
  const calibrationReadout = document.getElementById("calibration-readout")!;

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
  const aspectRatio = video.videoWidth / video.videoHeight;

  const store = new SessionStore();
  await store.open();
  const sessionId = await store.startSession(exercise.id);

  const worldLandmarksHistory: (PoseWorldLandmark[] | null)[] = [];

  // Seeded (see the space-bar handler below) with a COPY of the trailing
  // calibrationBuffer window the live gate just accepted, not left empty.
  // Without this seed, buildDepthSeries (called later, on just this array) must
  // independently re-find a fresh 90-frame stable window from the post-press
  // frames alone — and a user who starts squatting promptly after "Calibrated"
  // appears never gives it one: measured against the corpus, inter-rep standing
  // gaps run 37-66 frames, never 90, so 4 of 6 takes would never re-calibrate and
  // summarizeSession would report zero reps despite a clean set. Seeding with
  // the already-proven window makes buildDepthSeries's own findBaseline return
  // readyAt = 90 on its first iteration, with the identical baseline the live
  // gate computed — same values from the ready point onward as the corpus's
  // batch pipeline, so rep counts are unaffected.
  let trunkSamples: (TrunkSample | null)[] = [];

  // Per-frame tracking diagnostics, kept alongside the graded frames rather than
  // inside them: a frame with no pose at all is never stored (see below), so the
  // stored series silently omits those moments and any gap in it is unreadable.
  // Three sessions came back with long unexplained blank stretches that could
  // equally have been "no body found", "body found, joints not trusted", or
  // "user out of frame" -- indistinguishable from angles alone. Recording the
  // raw per-joint confidence separates them.
  const trackedJointIndices = [...new Set(exercise.rules.flatMap((r) => r.joints))].sort((a, b) => a - b);
  const tracking: { t: number; posed: boolean; visibility: number[] | null }[] = [];

  // Raw normalized 2D landmarks, kept so the planar trunk and depth measures
  // can be developed and validated against real capture rather than synthetic
  // fixtures. Recorded outside the "was this frame graded" guard below, so a
  // frame with no detected pose appears as lm: null instead of vanishing.
  const rawFrames: RecordedFrame[] = [];

  // Must match assessCalibration's own CALIBRATION_WINDOW_FRAMES
  // (src/form-checker/calibration.ts) — it is module-private there, so this is a
  // second declaration of the same measured constant (1.5s at 60fps, per Phase 2),
  // not an independent choice. Needed here so Task 6 can seed the recording-phase
  // trunkSamples array with the exact window the live gate just accepted.
  const CALIBRATION_WINDOW_FRAMES = 90;

  // Grows from the moment the camera starts, independent of `recording` — the
  // live calibration gate scans its trailing window every frame so the user can
  // become "ready" before pressing space. See assessCalibration's own docs: the
  // opening ~4.6-6.5s is the tracker converging and is the WORST window in every
  // corpus take, never a valid baseline.
  const calibrationBuffer: (TrunkSample | null)[] = [];
  let calibrationState: CalibrationState = {
    ready: false,
    baseline: null,
    message: "Hold still — measuring your standing position."
  };

  // One smoother per trunk landmark position. TRUNK_POSITIONS holds each trunk
  // landmark's index WITHIN the recorded 8-element array (landmark-recording.ts's
  // LM_INDEX order), not the raw MediaPipe landmark index — recordedLm is already
  // narrowed to that 8-element array by serializeLandmarks. 5-frame trailing
  // median: short enough to track a real descent (the fastest measured is 0.0625
  // depth-ratio/frame, corpus-manifest.md) while still killing a single-frame
  // position glitch before it reaches trunkSample.
  // Annotated number[] rather than left to infer: LM_INDEX is `as const`
  // (landmark-recording.ts), so an uncast array literal here would infer as
  // (0|1|2|3)[], and TRUNK_POSITIONS.indexOf(i) below passes it a plain `number`
  // (the .map callback's index) — a type error against the narrower inferred type.
  const TRUNK_POSITIONS: number[] = [LM_INDEX.leftShoulder, LM_INDEX.rightShoulder, LM_INDEX.leftHip, LM_INDEX.rightHip];
  const SMOOTHING_WINDOW = 5;
  const positionSmoothers = TRUNK_POSITIONS.map(() => new PositionSmoother(SMOOTHING_WINDOW));

  // The camera runs immediately so the user can frame themselves, but nothing is
  // recorded until they press space. A real session skipped ~86% of its rule
  // checks for landmark visibility with no warning until it was already over;
  // recording only starts once the user has seen whether their joints are visible.
  const framingReadout = document.getElementById("framing-readout")!;
  let recording = false;

  // Set the instant space is pressed, regardless of framing; cleared the
  // instant recording actually starts. null means no countdown/wait is in
  // progress. See recording-countdown.ts for why this exists: reaching the
  // laptop's own spacebar means standing close to it, which is never "ready"
  // framing, so the countdown has to tolerate not-ready and then wait for it.
  let countdownStartedAt: number | null = null;

  const engine = new PoseEngine();
  await engine.init();
  engine.start(video, (result) => {
    const landmarks = result.worldLandmarks[0] as PoseWorldLandmark[] | undefined;
    const frameResult = landmarks ? checkFrame(exercise, landmarks, overrides) : null;

    const recordedLm = serializeLandmarks(result.landmarks[0], Date.now()).lm;
    const smoothedLm = recordedLm
      ? recordedLm.map((point, i) => {
          const trunkPosition = TRUNK_POSITIONS.indexOf(i);
          if (trunkPosition === -1) return point;
          const [x, y] = positionSmoothers[trunkPosition].push([point[0], point[1]]);
          return [x, y, point[2], point[3]];
        })
      : null;
    const trunk = smoothedLm ? trunkSample(smoothedLm, aspectRatio) : null;

    drawOverlay(ctx, video, result, exercise, frameResult);

    if (!recording) {
      const framing = assessFraming(exercise, landmarks ?? []);
      calibrationBuffer.push(trunk);
      calibrationState = assessCalibration(calibrationBuffer);
      renderCalibrationReadout(calibrationReadout, calibrationState);

      const now = Date.now();
      const tick = tickCountdown(countdownStartedAt, calibrationState.ready, now);
      countdownStartedAt = tick.startedAt;

      if (tick.startRecording) {
        recording = true;
        trunkSamples = calibrationBuffer.slice(-CALIBRATION_WINDOW_FRAMES);
        framingReadout.classList.remove("ready", "not-ready");
        framingReadout.textContent = "Recording — press \"e\" to end the session.";
        calibrationReadout.classList.remove("ready", "not-ready");
        calibrationReadout.textContent = "Recording — hips and shoulders being tracked for depth.";
        return;
      }

      if (tick.waitingForReady) {
        framingReadout.classList.remove("ready", "not-ready");
        framingReadout.textContent = "Get in frame, side-on to the camera — recording starts as soon as you're in position.";
      } else if (countdownStartedAt !== null) {
        framingReadout.classList.remove("ready", "not-ready");
        framingReadout.textContent = `Starting in ${secondsRemaining(countdownStartedAt, now)}... hold your position, recording hasn't started yet.`;
      } else {
        renderFramingReadout(framingReadout, framing);
      }
      return;
    }

    tracking.push({
      t: Date.now(),
      posed: Boolean(landmarks),
      visibility: landmarks ? trackedJointIndices.map((i) => landmarks[i].visibility) : null
    });

    rawFrames.push({ t: Date.now(), lm: recordedLm });
    trunkSamples.push(trunk);
    worldLandmarksHistory.push(landmarks ?? null);

    if (frameResult && landmarks) {
      const record: SessionFrameRecord = {
        sessionId,
        timestamp: Date.now(),
        ruleResults: frameResult.ruleResults
      };
      store.queueFrame(record);
    }
  });

  window.addEventListener("keydown", (e) => {
    if (e.code !== "Space" || recording) return;
    e.preventDefault();
    countdownStartedAt = handleSpacePress(countdownStartedAt, recording, Date.now());
  });

  window.addEventListener("beforeunload", () => {
    engine.stop();
  });

  // Manual "end session" trigger for v1: a keyboard shortcut, since there's
  // no UI chrome specified in the spec beyond the core views.
  window.addEventListener("keydown", async (e) => {
    if (e.key !== "e" || !recording) return;
    recording = false;
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
    const summary = summarizeSession(trunkSamples);

    // Every rule's full per-frame angle series, dumped so metric changes can be
    // replayed against real capture rather than only synthetic fixtures. The previous
    // "real session" regression test pinned 12 hand-transcribed points; a 15deg
    // rep threshold passed 9 synthetic tests and still invented reps out of that
    // session's wobble, so the whole series is worth having on disk. Every rule
    // rather than just the rep signal, because whether some other joint would
    // segment reps more reliably can only be answered by lining them up frame
    // by frame. null means the rule wasn't evaluated on that frame.
    const angleSeries: Record<string, (number | null)[]> = {};
    for (const frame of frames) {
      for (const rule of frame.ruleResults) {
        (angleSeries[rule.ruleName] ??= []).push(rule.evaluated ? rule.angleDegrees : null);
      }
    }
    const replay = new ReplayView(replayContainer);
    let replayTimer: ReturnType<typeof setInterval> | null = null;

    function playFrames(frames: PoseWorldLandmark[][]): void {
      if (replayTimer !== null) clearInterval(replayTimer);
      let cursor = 0;
      if (frames.length === 0) return;
      replayTimer = setInterval(() => {
        replay.showFrame(frames[cursor]);
        const step = nextPlaybackFrame(cursor, frames.length);
        cursor = step.index;
        if (step.done && replayTimer !== null) {
          clearInterval(replayTimer);
          replayTimer = null;
        }
      }, 33);
    }

    renderProgressSummary(progressContainer, summary, (index) => {
      const rep = summary.reps[index];
      playFrames(framesForRep(worldLandmarksHistory, rep));
    });
    const ruleStats = buildRuleStats(frames);
    console.table(ruleStats);
    await postTestArtifact({
      timestamp: new Date().toISOString(),
      exerciseId: exercise.id,
      frameCount: frames.length,
      summary,
      ruleStats,
      angleSeries,
      tracking: { jointIndices: trackedJointIndices, frames: tracking },
      raw: {
        landmarkIndices: RECORDED_LANDMARK_INDICES,
        tupleOrder: ["x", "y", "z", "visibility"],
        videoWidth: video.videoWidth,
        videoHeight: video.videoHeight,
        frames: rawFrames
      },
      errors: capturedErrors
    });

    const worstRep = summary.worstRepIndex !== null ? summary.reps[summary.worstRepIndex] : null;
    if (worstRep) {
      playFrames(framesForRep(worldLandmarksHistory, worstRep));
    } else {
      playFrames(worldLandmarksHistory.filter((f): f is PoseWorldLandmark[] => f !== null));
    }
  });
}

main();
