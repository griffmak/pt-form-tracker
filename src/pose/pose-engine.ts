import { FilesetResolver, PoseLandmarker, type PoseLandmarkerResult } from "@mediapipe/tasks-vision";

export type PoseFrameCallback = (result: PoseLandmarkerResult) => void;

export class PoseEngine {
  private landmarker: PoseLandmarker | null = null;
  private running = false;

  async init(): Promise<void> {
    const vision = await FilesetResolver.forVisionTasks(
      "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm"
    );
    this.landmarker = await PoseLandmarker.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath:
          "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task",
        delegate: "GPU"
      },
      runningMode: "VIDEO",
      numPoses: 1
    });
  }

  start(video: HTMLVideoElement, onFrame: PoseFrameCallback): void {
    if (!this.landmarker) throw new Error("PoseEngine.init() must resolve before start()");
    this.running = true;

    const loop = () => {
      if (!this.running) return;
      const result = this.landmarker!.detectForVideo(video, performance.now());
      onFrame(result);
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  stop(): void {
    this.running = false;
  }
}
