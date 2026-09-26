import assert from "node:assert/strict";
import test from "node:test";

import { deleteMoonTaleBrowserData } from "../assets/scripts/core/browser-data.js";
import {
  readSavedStories,
  saveGeneratedStory,
} from "../assets/scripts/core/storage.js";
import { translateFor } from "../assets/scripts/core/i18n.js";
import {
  ACCOUNT_STORY_SAVE_KEY_PREFIX,
  STORY_SAVE_LOCK_TTL_MS,
  beginStorySave,
  markStorySaved,
  readStorySaveState,
} from "../assets/scripts/services/story-save-state.js";
import {
  ACCEPTED_STORY_STORAGE_PREFIX,
  loadOrGenerateAcceptedStory,
  readAcceptedStory,
  storyErrorState,
} from "../assets/scripts/services/story-state.js";

class MemoryStorage {
  constructor(entries = []) {
    this.values = new Map(entries);
  }

  get length() {
    return this.values.size;
  }

  key(index) {
    return [...this.values.keys()][index] ?? null;
  }

  getItem(key) {
    return this.values.has(key) ? this.values.get(key) : null;
  }

  setItem(key, value) {
    this.values.set(key, String(value));
  }

  removeItem(key) {
    this.values.delete(key);
  }
}

const storyGenerationId = "story_A_reload_0123456789";

function profile() {
  return {
    storyGenerationId,
    targetLanguage: "Spanish",
    interest: "stars",
  };
}

function finalizedStory() {
  return {
    title: "Story A",
    paragraphs: ["Story A paragraph one.", "Story A paragraph two."],
    ending: "Story A ended safely.",
    parentTip: "Ask about the moon.",
    readingTime: "3 min read",
    languageMeta: "Spanish · 1 new word",
    vocabularyIntro: "Learning Spanish with English meanings.",
    learningGoal: "Courage: try one small brave step.",
    vocabulary: [{ id: "moon", word: "luna", meaning: "moon" }],
    metadata: {
      interfaceLanguage: "en",
      narrativeLanguage: "en",
      learningLanguage: "es",
      readingTime: "3",
      requestedVocabularyCount: 1,
      character: "Astronaut",
      mood: "Magical",
      goal: "Courage",
      generationId: "gen_provider_A_0123456789",
      storyGenerationId,
      repaired: false,
      source: "candidate17-local-worker",
    },
    rawProviderResponse: "must not persist",
    trustEvidence: { signature: "must not persist" },
  };
}

const errorCases = [
  [
    "invalid_request",
    "INVALID_CONFIGURATION",
    "Some story details need to be corrected before MoonTale can generate this story.",
  ],
  [
    "unsupported_language_pair",
    "UNSUPPORTED_LANGUAGE_PAIR",
    "This language combination isn't available for story generation yet.",
  ],
  [
    "provider_rate_limited",
    "PROVIDER_RATE_LIMIT",
    "MoonTale is preparing many stories right now. Please try again shortly.",
  ],
  [
    "pilot_quota_exceeded",
    "PROVIDER_RATE_LIMIT",
    "MoonTale is preparing many stories right now. Please try again shortly.",
  ],
  [
    "provider_timeout",
    "PROVIDER_TIMEOUT",
    "The story took too long to prepare. Please try again.",
  ],
  [
    "provider_unavailable",
    "PROVIDER_UNAVAILABLE",
    "Story generation is temporarily unavailable. Please try again shortly.",
  ],
  [
    "pilot_admission_unavailable",
    "PROVIDER_UNAVAILABLE",
    "Story generation is temporarily unavailable. Please try again shortly.",
  ],
  [
    "pilot_authorization_required",
    "INVALID_CONFIGURATION",
    "Sign in to a parent account to create stories in the MoonTale private pilot.",
  ],
  [
    "pilot_access_denied",
    "INVALID_CONFIGURATION",
    "This parent account is not currently enabled for MoonTale private-pilot story generation.",
  ],
  [
    "quality_block",
    "QUALITY_BLOCK",
    "MoonTale couldn't produce a story that met its quality checks. Please try again.",
  ],
  [
    "safety_block",
    "SAFETY_BLOCK",
    "MoonTale couldn't create a suitable story from these details. Please adjust the story choices.",
  ],
  [
    "unsafe_input",
    "UNSAFE_INPUT",
    "MoonTale couldn't create a suitable story from these details. Please adjust the story choices.",
  ],
  [
    "generation_failed",
    "GENERATION_FAILURE",
    "MoonTale couldn't finish this story. Please try again.",
  ],
  [
    "unexpected_internal_code",
    "UNKNOWN_SAFE_FAILURE",
    "MoonTale couldn't finish this story. Please try again.",
  ],
];

for (const [apiCode, safeCode, expectedMessage] of errorCases) {
  test(`${apiCode} maps to ${safeCode} without a false safety message`, () => {
    const state = storyErrorState({ code: apiCode });
    assert.equal(state.code, safeCode);
    assert.equal(translateFor("en", state.translationKey), expectedMessage);
  });
}

test("pilot authorization and access messages are distinct in all supported interface languages", () => {
  for (const language of ["en", "pl", "es", "fr", "de"]) {
    const authorization = storyErrorState({
      code: "pilot_authorization_required",
    });
    const access = storyErrorState({ code: "pilot_access_denied" });
    const invalid = storyErrorState({ code: "invalid_request" });

    const authorizationMessage = translateFor(
      language,
      authorization.translationKey,
    );
    const accessMessage = translateFor(language, access.translationKey);
    const invalidMessage = translateFor(language, invalid.translationKey);

    assert.ok(authorizationMessage);
    assert.ok(accessMessage);
    assert.notEqual(authorizationMessage, invalidMessage);
    assert.notEqual(accessMessage, invalidMessage);
    assert.notEqual(authorizationMessage, accessMessage);
  }
});

test("accepted Story A survives a simulated reload without another generation", async () => {
  const storage = new MemoryStorage();
  let generationCalls = 0;
  const generate = async () => {
    generationCalls += 1;
    return finalizedStory();
  };

  const first = await loadOrGenerateAcceptedStory({
    profile: profile(),
    storage,
    generate,
  });
  const reloaded = await loadOrGenerateAcceptedStory({
    profile: profile(),
    storage,
    generate,
  });

  assert.equal(first.source, "generation");
  assert.equal(reloaded.source, "cache");
  assert.equal(generationCalls, 1);
  assert.equal(
    reloaded.story.metadata.storyGenerationId,
    storyGenerationId,
  );
  assert.deepEqual(reloaded.story, readAcceptedStory(profile(), storage));
  assert.equal(reloaded.story.title, "Story A");
  assert.deepEqual(reloaded.story.paragraphs, finalizedStory().paragraphs);
});

test("no accepted cache follows the normal generation path", async () => {
  const storage = new MemoryStorage();
  let generationCalls = 0;
  const result = await loadOrGenerateAcceptedStory({
    profile: profile(),
    storage,
    generate: async () => {
      generationCalls += 1;
      return finalizedStory();
    },
  });
  assert.equal(result.source, "generation");
  assert.equal(generationCalls, 1);
});

test("accepted cache contains finalized display state but no raw provider or trust data", async () => {
  const storage = new MemoryStorage();
  await loadOrGenerateAcceptedStory({
    profile: profile(),
    storage,
    generate: async () => finalizedStory(),
  });
  const serialized = storage.getItem(
    `${ACCEPTED_STORY_STORAGE_PREFIX}${storyGenerationId}`,
  );
  assert.doesNotMatch(
    serialized,
    /rawProviderResponse|trustEvidence|signature|must not persist/u,
  );
});

test("fresh save acquires one structured saving state", () => {
  const storage = new MemoryStorage();
  const result = beginStorySave(storyGenerationId, storage, 10_000);
  assert.deepEqual(result, { shouldSave: true, reason: "fresh" });
  assert.deepEqual(readStorySaveState(storyGenerationId, storage), {
    version: 1,
    status: "saving",
    updatedAt: 10_000,
  });
});

test("a recent saving state suppresses a concurrent duplicate", () => {
  const storage = new MemoryStorage();
  beginStorySave(storyGenerationId, storage, 10_000);
  assert.deepEqual(beginStorySave(storyGenerationId, storage, 11_000), {
    shouldSave: false,
    reason: "saving",
  });
});

test("an expired saving state is recovered instead of blocking forever", () => {
  const storage = new MemoryStorage();
  beginStorySave(storyGenerationId, storage, 10_000);
  const now = 10_000 + STORY_SAVE_LOCK_TTL_MS + 1;
  assert.deepEqual(beginStorySave(storyGenerationId, storage, now), {
    shouldSave: true,
    reason: "stale_saving_recovered",
  });
  assert.equal(readStorySaveState(storyGenerationId, storage).updatedAt, now);
});

test("a legacy unbounded saving marker is treated as stale and recovered", () => {
  const storage = new MemoryStorage([
    [`${ACCOUNT_STORY_SAVE_KEY_PREFIX}${storyGenerationId}`, "saving"],
  ]);
  assert.deepEqual(beginStorySave(storyGenerationId, storage, 20_000), {
    shouldSave: true,
    reason: "stale_saving_recovered",
  });
});

test("a saved state suppresses later repeated saves", () => {
  const storage = new MemoryStorage();
  beginStorySave(storyGenerationId, storage, 10_000);
  assert.equal(markStorySaved(storyGenerationId, storage, 11_000), true);
  assert.deepEqual(beginStorySave(storyGenerationId, storage, 99_000), {
    shouldSave: false,
    reason: "saved",
  });
});

test("the same storyGenerationId rendered repeatedly enters local history once", () => {
  const storage = new MemoryStorage();
  assert.equal(saveGeneratedStory(finalizedStory(), profile(), storage), true);
  assert.equal(saveGeneratedStory(finalizedStory(), profile(), storage), false);
  assert.equal(readSavedStories(storage).length, 1);
  assert.equal(
    readSavedStories(storage)[0].storyGenerationId,
    storyGenerationId,
  );
});

test("browser-data cleanup removes accepted-story and save-state keys", () => {
  const storage = new MemoryStorage([
    ["moontaleStoryProfile", "profile"],
    ["moontaleSavedStories", "stories"],
    [`${ACCEPTED_STORY_STORAGE_PREFIX}${storyGenerationId}`, "accepted"],
    [`${ACCOUNT_STORY_SAVE_KEY_PREFIX}${storyGenerationId}`, "saving"],
    ["unrelated", "keep"],
  ]);
  assert.equal(deleteMoonTaleBrowserData(storage), true);
  assert.equal(storage.getItem("moontaleStoryProfile"), null);
  assert.equal(storage.getItem("moontaleSavedStories"), null);
  assert.equal(
    storage.getItem(`${ACCEPTED_STORY_STORAGE_PREFIX}${storyGenerationId}`),
    null,
  );
  assert.equal(
    storage.getItem(`${ACCOUNT_STORY_SAVE_KEY_PREFIX}${storyGenerationId}`),
    null,
  );
  assert.equal(storage.getItem("unrelated"), "keep");
});
