import assert from "node:assert/strict";
import test from "node:test";

import {
  LOCAL_STORY_API_LANGUAGES,
  StaleStoryRequestError,
  StoryApiError,
  createStoryRequestController,
  localStoryLanguagePairSupported,
  localStoryProfileCompatibility,
  migrateLocalStoryProfile,
  requestLocalStory,
  shouldUseLocalStoryApi,
} from "../assets/scripts/services/story-api.js";

function profile() {
  return {
    childName: "Milo",
    ageBand: "6-8",
    currentLanguage: "English",
    targetLanguage: "Spanish",
    narrativeLanguage: "en",
    learningLanguage: "es",
    interfaceLanguage: "en",
    character: "Astronaut",
    mood: "Magical",
    interest: "stars",
    goal: "Courage",
    readingTime: "3",
    newWordsCount: "3",
    storyGenerationId: "story_generation_123",
    childProfileId: "private-profile-id",
    email: "parent@example.com",
    adultAuthorization: {
      confirmed: true,
      policyVersion: "moontale-controlled-family-pilot-v1",
      purpose: "ai-story-generation",
    },
  };
}

function passedBody() {
  return {
    schemaVersion: "moontale-story-api-v1",
    status: "passed",
    requestId: "req_frontend_12345678",
    generationId: "gen_frontend_12345678",
    story: {
      title: "A Quiet MoonTale",
      paragraphs: ["A gentle story paragraph."],
      ending: "Everyone returned home safely.",
      parentTip: "Ask about a new word.",
    },
    vocabulary: [
      { id: "moon", word: "luna", meaning: "moon" },
      { id: "star", word: "estrella", meaning: "star" },
      { id: "courage", word: "valentía", meaning: "courage" },
    ],
    metadata: { repaired: false },
  };
}

test("local API routing activates only on loopback hosts", () => {
  assert.equal(shouldUseLocalStoryApi({ hostname: "127.0.0.1" }), true);
  assert.equal(shouldUseLocalStoryApi({ hostname: "localhost" }), true);
  assert.equal(shouldUseLocalStoryApi({ hostname: "moontaleapp.com" }), false);
});

test("supported language intent is preserved exactly", () => {
  assert.deepEqual(LOCAL_STORY_API_LANGUAGES, ["en", "es", "fr", "de"]);
  const migrated = migrateLocalStoryProfile({
    ...profile(),
    currentLanguage: "English",
    narrativeLanguage: "en",
    targetLanguage: "French",
    learningLanguage: "fr",
  });
  assert.equal(migrated.currentLanguage, "English");
  assert.equal(migrated.narrativeLanguage, "en");
  assert.equal(migrated.targetLanguage, "French");
  assert.equal(migrated.learningLanguage, "fr");
  assert.equal(localStoryLanguagePairSupported(migrated), true);
});

for (const [label, currentLanguage, targetLanguage, expectedCodes] of [
  ["en to pl", "English", "Polish", ["en", "pl"]],
  ["pl to es", "Polish", "Spanish", ["pl", "es"]],
  ["en to en", "English", "English", ["en", "en"]],
]) {
  test(`${label} is preserved and requires explicit correction`, () => {
    const migrated = migrateLocalStoryProfile({
      ...profile(),
      currentLanguage,
      targetLanguage,
      narrativeLanguage: expectedCodes[0],
      learningLanguage: expectedCodes[1],
    });
    assert.equal(migrated.currentLanguage, currentLanguage);
    assert.equal(migrated.targetLanguage, targetLanguage);
    assert.equal(migrated.narrativeLanguage, expectedCodes[0]);
    assert.equal(migrated.learningLanguage, expectedCodes[1]);
    assert.equal(localStoryLanguagePairSupported(migrated), false);
    assert.equal(localStoryProfileCompatibility(migrated).ok, false);
  });
}

test("an unsupported saved profile exposes correction issues without substitution", () => {
  const saved = migrateLocalStoryProfile({
    ...profile(),
    currentLanguage: "Polish",
    narrativeLanguage: "pl",
    targetLanguage: "Spanish",
    learningLanguage: "es",
    interest: "football",
  });
  const compatibility = localStoryProfileCompatibility(saved);
  assert.deepEqual([...compatibility.issues].sort(), [
    "unsupported_interest",
    "unsupported_language_pair",
  ]);
  assert.equal(saved.currentLanguage, "Polish");
  assert.equal(saved.targetLanguage, "Spanish");
  assert.equal(saved.interest, "football");
});

test("a supported controlled saved interest is preserved", () => {
  const migrated = migrateLocalStoryProfile({
    ...profile(),
    interest: "robots",
  });
  assert.equal(migrated.interest, "robots");
  assert.equal(localStoryProfileCompatibility(migrated).ok, true);
});

test("frontend sends the minimal profile and stable vocabulary IDs", async () => {
  let submitted;
  const story = await requestLocalStory(profile(), {
    endpoint: "http://127.0.0.1:8787/api/story/generate",
    fetchImpl: async (_url, init) => {
      submitted = JSON.parse(init.body);
      return new Response(JSON.stringify(passedBody()), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    },
  });

  assert.equal(story.metadata.source, "candidate17-local-worker");
  assert.deepEqual([...submitted.targetVocabularyIds].sort(), [
    "courage",
    "moon",
    "star",
  ]);
  assert.equal(submitted.profile.childProfileId, undefined);
  assert.equal(submitted.profile.email, undefined);
  assert.equal(submitted.profile.storyGenerationId, undefined);
  assert.equal(submitted.profile.childName, undefined);
  assert.equal(submitted.profile.childAge, undefined);
  assert.equal(submitted.profile.ageBand, "6-8");
  assert.equal(submitted.profile.interest, "stars");
  assert.deepEqual(submitted.adultAuthorization, {
    confirmed: true,
    policyVersion: "moontale-controlled-family-pilot-v1",
    purpose: "ai-story-generation",
  });
});

test("legacy exact age is coarsened but an explicit saved interest is preserved for correction", () => {
  const migrated = migrateLocalStoryProfile({
    ...profile(),
    ageBand: undefined,
    childAge: "7",
    interest: "my school and doctor",
  });

  assert.equal(migrated.ageBand, "6-8");
  assert.equal(migrated.interest, "my school and doctor");
  assert.equal(Object.hasOwn(migrated, "childAge"), false);
  assert.deepEqual(localStoryProfileCompatibility(migrated).issues, [
    "unsupported_interest",
  ]);
});

test("an out-of-scope legacy age is not represented as a younger child", () => {
  const migrated = migrateLocalStoryProfile({
    ...profile(),
    ageBand: undefined,
    childAge: "13",
  });
  assert.equal(migrated.ageBand, "");
  assert.equal(Object.hasOwn(migrated, "childAge"), false);
  assert.equal(
    localStoryProfileCompatibility(migrated).issues.includes(
      "unsupported_age_band",
    ),
    true,
  );
});

test("a saved 12+ account group remains 12+ and requires age correction", () => {
  const migrated = migrateLocalStoryProfile({
    ...profile(),
    ageBand: "12+",
  });
  assert.equal(migrated.ageBand, "12+");
  assert.equal(
    localStoryProfileCompatibility(migrated).issues.includes(
      "unsupported_age_band",
    ),
    true,
  );
});

test("unsupported intent is rejected before any frontend generation request", async () => {
  let calls = 0;
  await assert.rejects(
    requestLocalStory(
      {
        ...profile(),
        targetLanguage: "Polish",
        learningLanguage: "pl",
      },
      {
        fetchImpl: async () => {
          calls += 1;
          throw new Error("must not run");
        },
      },
    ),
    (error) =>
      error instanceof StoryApiError &&
      error.code === "unsupported_language_pair",
  );
  assert.equal(calls, 0);
});

test("malformed success responses are rejected instead of rendered", async () => {
  await assert.rejects(
    requestLocalStory(profile(), {
      fetchImpl: async () =>
        new Response(
          JSON.stringify({ ...passedBody(), story: { title: "partial" } }),
          {
            status: 200,
            headers: { "content-type": "application/json" },
          },
        ),
    }),
    (error) =>
      error instanceof StoryApiError &&
      error.code === "provider_invalid_response",
  );
});

test("a rate-limit response exposes only a bounded safe retry delay", async () => {
  await assert.rejects(
    requestLocalStory(profile(), {
      fetchImpl: async () =>
        new Response(
          JSON.stringify({
            schemaVersion: "moontale-story-api-v1",
            status: "error",
            error: {
              code: "provider_rate_limited",
              message: "The story service is resting briefly.",
              retryable: true,
            },
          }),
          {
            status: 429,
            headers: {
              "content-type": "application/json",
              "retry-after": "17",
            },
          },
        ),
    }),
    (error) => {
      assert.equal(error instanceof StoryApiError, true);
      assert.equal(error.code, "provider_rate_limited");
      assert.equal(error.retryable, true);
      assert.equal(error.retryAfterSeconds, 17);
      assert.doesNotMatch(JSON.stringify(error), /prompt|GROQ_API_KEY|Milo/u);
      return true;
    },
  );
});

test("a superseded request cannot overwrite the newest story", async () => {
  let call = 0;
  const controller = createStoryRequestController({
    fetchImpl: (_url, init) => {
      call += 1;
      if (call === 1) {
        return new Promise((_resolve, reject) => {
          init.signal.addEventListener(
            "abort",
            () => reject(new DOMException("Aborted", "AbortError")),
            { once: true },
          );
        });
      }
      return Promise.resolve(
        new Response(JSON.stringify(passedBody()), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      );
    },
  });

  const oldRequest = controller.generate(profile());
  const newestStory = await controller.generate(profile());

  await assert.rejects(oldRequest, StaleStoryRequestError);
  assert.equal(newestStory.title, "A Quiet MoonTale");
});
