import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { SessionStore, type SessionFrameRecord } from "./session-store";

function deleteTestDatabase(): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase("pt-form-tracker");
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
    request.onblocked = () => resolve();
  });
}

describe("SessionStore", () => {
  let store: SessionStore;

  beforeEach(async () => {
    await deleteTestDatabase();
  });

  afterEach(() => {
    store?.close();
  });

  it("persists queued frames and reads them back after flush", async () => {
    store = new SessionStore();
    await store.open();

    const sessionId = await store.startSession("squat");
    const frame: SessionFrameRecord = {
      sessionId,
      timestamp: Date.now(),
      ruleResults: [{ ruleName: "Knee bend depth", evaluated: true, passed: true, angleDegrees: 90 }]
    };

    store.queueFrame(frame);
    await store.flush();

    const frames = await store.getFramesForSession(sessionId);
    expect(frames).toHaveLength(1);
    expect(frames[0].ruleResults[0].passed).toBe(true);
  });

  it("reports a write failure instead of silently dropping data", async () => {
    store = new SessionStore();
    await store.open();
    // Force a failure by closing the underlying connection before flush.
    store.forceCloseForTesting();

    const sessionId = "fake-session";
    store.queueFrame({ sessionId, timestamp: Date.now(), ruleResults: [] });

    await expect(store.flush()).rejects.toThrow();
  });
});
