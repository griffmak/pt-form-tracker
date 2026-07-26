import type { RuleOverride } from "./types";

export const OVERRIDES_STORAGE_KEY = "pt-form-tracker:rule-overrides";

/**
 * Rule overrides are stored separately from session history (IndexedDB): they're a
 * small, synchronously-read user setting that the form checker needs on every frame.
 * Storage is injected so this stays testable and never assumes a browser global.
 */
export function loadOverrides(storage: Storage): RuleOverride[] {
  const raw = storage.getItem(OVERRIDES_STORAGE_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    // Corrupt data should degrade to "no overrides", never break the session.
    return [];
  }
}

export function saveOverride(override: RuleOverride, storage: Storage): void {
  const others = loadOverrides(storage).filter(
    (o) => !(o.exerciseId === override.exerciseId && o.ruleName === override.ruleName)
  );
  storage.setItem(OVERRIDES_STORAGE_KEY, JSON.stringify([...others, override]));
}

export function clearOverride(exerciseId: string, ruleName: string, storage: Storage): void {
  const remaining = loadOverrides(storage).filter(
    (o) => !(o.exerciseId === exerciseId && o.ruleName === ruleName)
  );
  storage.setItem(OVERRIDES_STORAGE_KEY, JSON.stringify(remaining));
}
