import { readFileSync } from "node:fs";

export { LM_INDEX } from "../src/pose/landmark-recording";

export interface CorpusFrame {
  t: number;
  /** [x, y, z, visibility] per landmark, in RECORDED_LANDMARK_INDICES order. null = no pose. */
  lm: number[][] | null;
}

export interface Corpus {
  name: string;
  videoWidth: number;
  videoHeight: number;
  /** videoWidth / videoHeight. Required before any atan2 over normalized coords. */
  aspectRatio: number;
  frames: CorpusFrame[];
}

/** Ground truth from corpus-manifest.md. Update both together if a take is re-recorded. */
export const CORPUS_TAKES = [
  { name: "corpus-01-standing", groundTruthReps: 0 },
  { name: "corpus-02-five-slow", groundTruthReps: 5 },
  { name: "corpus-03-five-normal", groundTruthReps: 5 },
  { name: "corpus-04-shallow", groundTruthReps: 5 },
  { name: "corpus-05-degrading", groundTruthReps: 8 },
  { name: "corpus-06-drift", groundTruthReps: 5 }
];

export function loadCorpus(name: string): Corpus {
  const raw = JSON.parse(readFileSync(`.claude-test-artifacts/${name}.json`, "utf8")).raw;
  return {
    name,
    videoWidth: raw.videoWidth,
    videoHeight: raw.videoHeight,
    aspectRatio: raw.videoWidth / raw.videoHeight,
    frames: raw.frames
  };
}
