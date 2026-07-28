import { describe, test, expect, beforeEach } from "vitest";
import { loadOverrides, saveOverride, clearOverride, OVERRIDES_STORAGE_KEY } from "./overrides";

/**
 * A real (in-memory) implementation of the Storage interface. Node's experimental
 * localStorage shadows jsdom's in this test environment, so overrides take their
 * storage by injection and tests supply this instead.
 */
function createMemoryStorage(): Storage {
  let map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, String(v)),
    removeItem: (k) => void map.delete(k),
    key: (i) => [...map.keys()][i] ?? null
  };
}

describe("rule overrides", () => {
  let storage: Storage;

  beforeEach(() => {
    storage = createMemoryStorage();
  });

  test("returns no overrides when nothing has been saved", () => {
    expect(loadOverrides(storage)).toEqual([]);
  });

  test("saved override is returned by a later load", () => {
    saveOverride({ exerciseId: "squat", ruleName: "Knee bend depth", minDegrees: 60, maxDegrees: 110 }, storage);

    expect(loadOverrides(storage)).toEqual([
      { exerciseId: "squat", ruleName: "Knee bend depth", minDegrees: 60, maxDegrees: 110 }
    ]);
  });

  test("saving the same rule twice replaces it instead of duplicating", () => {
    saveOverride({ exerciseId: "squat", ruleName: "Knee bend depth", minDegrees: 60, maxDegrees: 110 }, storage);
    saveOverride({ exerciseId: "squat", ruleName: "Knee bend depth", minDegrees: 75, maxDegrees: 95 }, storage);

    expect(loadOverrides(storage)).toEqual([
      { exerciseId: "squat", ruleName: "Knee bend depth", minDegrees: 75, maxDegrees: 95 }
    ]);
  });

  test("overrides for different rules coexist", () => {
    saveOverride({ exerciseId: "squat", ruleName: "Knee bend depth", minDegrees: 60, maxDegrees: 110 }, storage);
    saveOverride({ exerciseId: "squat", ruleName: "Some other rule", minDegrees: 40, maxDegrees: 95 }, storage);

    expect(loadOverrides(storage)).toHaveLength(2);
  });

  test("clearing an override leaves the others intact", () => {
    saveOverride({ exerciseId: "squat", ruleName: "Knee bend depth", minDegrees: 60, maxDegrees: 110 }, storage);
    saveOverride({ exerciseId: "squat", ruleName: "Some other rule", minDegrees: 40, maxDegrees: 95 }, storage);

    clearOverride("squat", "Knee bend depth", storage);

    expect(loadOverrides(storage)).toEqual([
      { exerciseId: "squat", ruleName: "Some other rule", minDegrees: 40, maxDegrees: 95 }
    ]);
  });

  test("corrupt stored data is ignored rather than crashing the app", () => {
    storage.setItem(OVERRIDES_STORAGE_KEY, "{not valid json");

    expect(loadOverrides(storage)).toEqual([]);
  });
});
