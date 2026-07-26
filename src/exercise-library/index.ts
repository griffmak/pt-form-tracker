import type { ExerciseDefinition } from "./types";
import { squat } from "./squat";

export const exerciseLibrary: Record<string, ExerciseDefinition> = {
  [squat.id]: squat
};

export * from "./types";
