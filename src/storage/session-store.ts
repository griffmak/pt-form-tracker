import type { RuleResult } from "../form-checker/form-checker";

export interface SessionFrameRecord {
  sessionId: string;
  timestamp: number;
  ruleResults: RuleResult[];
}

const DB_NAME = "pt-form-tracker";
const DB_VERSION = 1;
const STORE_NAME = "frames";
const FLUSH_BATCH_SIZE = 30;

/**
 * Batches frame writes so IndexedDB I/O doesn't compete with the live
 * inference/render loop on every single frame (mobile-critical, see spec).
 */
export class SessionStore {
  private db: IDBDatabase | null = null;
  private queue: SessionFrameRecord[] = [];

  async open(): Promise<void> {
    this.db = await new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, { keyPath: "id", autoIncrement: true });
          store.createIndex("sessionId", "sessionId", { unique: false });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async startSession(_exerciseId: string): Promise<string> {
    return crypto.randomUUID();
  }

  queueFrame(frame: SessionFrameRecord): void {
    this.queue.push(frame);
    if (this.queue.length >= FLUSH_BATCH_SIZE) {
      // Fire-and-forget is intentional here; callers doing a final flush
      // at session-end still await flush() explicitly.
      void this.flush();
    }
  }

  async flush(): Promise<void> {
    if (!this.db) throw new Error("SessionStore not open");
    if (this.queue.length === 0) return;

    const toWrite = this.queue.splice(0, this.queue.length);

    await new Promise<void>((resolve, reject) => {
      const tx = this.db!.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      for (const frame of toWrite) {
        store.add(frame);
      }
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(new Error("IndexedDB transaction aborted"));
    });
  }

  async getFramesForSession(sessionId: string): Promise<SessionFrameRecord[]> {
    if (!this.db) throw new Error("SessionStore not open");
    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction(STORE_NAME, "readonly");
      const index = tx.objectStore(STORE_NAME).index("sessionId");
      const request = index.getAll(sessionId);
      request.onsuccess = () => resolve(request.result as SessionFrameRecord[]);
      request.onerror = () => reject(request.error);
    });
  }

  /** Test-only hook to simulate a storage failure. */
  forceCloseForTesting(): void {
    this.db?.close();
    this.db = null;
  }

  close(): void {
    this.db?.close();
    this.db = null;
  }
}
