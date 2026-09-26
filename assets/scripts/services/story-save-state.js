export const ACCOUNT_STORY_SAVE_KEY_PREFIX =
  "moontaleAccountStorySave:";
export const STORY_SAVE_LOCK_TTL_MS = 2 * 60_000;
const STORY_SAVE_STATE_VERSION = 1;

function browserStorage(storage) {
  if (storage) return storage;
  try {
    return globalThis.localStorage || null;
  } catch {
    return null;
  }
}

function saveKey(storyGenerationId) {
  const value = String(storyGenerationId || "").trim();
  return /^[A-Za-z0-9][A-Za-z0-9_-]{7,127}$/u.test(value)
    ? `${ACCOUNT_STORY_SAVE_KEY_PREFIX}${value}`
    : "";
}

export function readStorySaveState(storyGenerationId, storage) {
  const localStorage = browserStorage(storage);
  const key = saveKey(storyGenerationId);
  if (!localStorage || !key) return null;
  try {
    const raw = localStorage.getItem(key);
    if (raw === "saved") {
      return { version: 0, status: "saved", updatedAt: 0 };
    }
    if (raw === "saving") {
      return { version: 0, status: "saving", updatedAt: 0 };
    }
    const parsed = JSON.parse(raw || "null");
    if (
      parsed?.version !== STORY_SAVE_STATE_VERSION ||
      !["saving", "saved"].includes(parsed.status) ||
      !Number.isFinite(parsed.updatedAt)
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function writeState(storyGenerationId, status, storage, now) {
  const localStorage = browserStorage(storage);
  const key = saveKey(storyGenerationId);
  if (!localStorage || !key) return false;
  try {
    localStorage.setItem(
      key,
      JSON.stringify({
        version: STORY_SAVE_STATE_VERSION,
        status,
        updatedAt: now,
      }),
    );
    return true;
  } catch {
    return false;
  }
}

export function beginStorySave(
  storyGenerationId,
  storage,
  now = Date.now(),
) {
  const current = readStorySaveState(storyGenerationId, storage);
  if (current?.status === "saved") {
    return Object.freeze({ shouldSave: false, reason: "saved" });
  }
  if (
    current?.status === "saving" &&
    current.version === STORY_SAVE_STATE_VERSION &&
    now - current.updatedAt >= 0 &&
    now - current.updatedAt < STORY_SAVE_LOCK_TTL_MS
  ) {
    return Object.freeze({ shouldSave: false, reason: "saving" });
  }

  const recovered = current?.status === "saving";
  if (!writeState(storyGenerationId, "saving", storage, now)) {
    return Object.freeze({ shouldSave: false, reason: "storage_unavailable" });
  }
  return Object.freeze({
    shouldSave: true,
    reason: recovered ? "stale_saving_recovered" : "fresh",
  });
}

export function markStorySaved(
  storyGenerationId,
  storage,
  now = Date.now(),
) {
  return writeState(storyGenerationId, "saved", storage, now);
}

export function clearStorySaveState(storyGenerationId, storage) {
  const localStorage = browserStorage(storage);
  const key = saveKey(storyGenerationId);
  if (!localStorage || !key) return false;
  try {
    localStorage.removeItem(key);
    return true;
  } catch {
    return false;
  }
}
