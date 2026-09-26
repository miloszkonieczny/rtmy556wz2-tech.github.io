import {
  SUPPORTED_CHARACTERS,
  SUPPORTED_GOALS,
  SUPPORTED_MOODS,
  clampNewWordsCount,
  languageCodeFromName,
  languageNameFromCode,
  normalizeReadingTime,
  resolveLanguageConfig,
} from "../core/config.js?v=20260724-story-fix";
import { translateFor } from "../core/i18n.js?v=20260724-story-fix";
import { selectVocabularyWithMetadata } from "./vocabulary.js";
import {
  LOCAL_STORY_ADULT_AUTHORIZATION,
  LOCAL_STORY_AGE_BANDS,
  LOCAL_STORY_API_LANGUAGES,
  LOCAL_STORY_INTERESTS,
} from "../../../data/local-story-contract.js";

export {
  LOCAL_STORY_ADULT_AUTHORIZATION,
  LOCAL_STORY_AGE_BANDS,
  LOCAL_STORY_API_LANGUAGES,
  LOCAL_STORY_INTERESTS,
};

const STORY_API_PATH = "/api/story/generate";
const LOCAL_STORY_API_ORIGIN = "http://127.0.0.1:8787";
const PRODUCTION_FRONTEND_ORIGIN = "https://moontaleapp.com";
const PRODUCTION_STORY_API_ORIGIN = "https://api.moontaleapp.com";
const REQUEST_TIMEOUT_MS = 300_000;
const API_VERSION = "moontale-story-api-v1";
const LOCAL_STORY_API_LANGUAGE_SET = new Set(LOCAL_STORY_API_LANGUAGES);

function storyApiUrl(origin) {
  return new URL(STORY_API_PATH, origin).href;
}

export class StoryApiError extends Error {
  constructor(
    code = "generation_failed",
    retryable = true,
    retryAfterSeconds = null,
  ) {
    super(code);
    this.name = "StoryApiError";
    this.code = code;
    this.retryable = retryable;
    this.retryAfterSeconds =
      Number.isInteger(retryAfterSeconds) &&
      retryAfterSeconds >= 0 &&
      retryAfterSeconds <= 86_400
        ? retryAfterSeconds
        : null;
  }
}

export class StaleStoryRequestError extends Error {
  constructor() {
    super("stale_story_request");
    this.name = "StaleStoryRequestError";
  }
}

function createRequestId() {
  const random = crypto.randomUUID().replaceAll("-", "");
  return `req_${random}`;
}

function validAccessToken(value) {
  return Boolean(
    typeof value === "string" &&
      value.length <= 4_096 &&
      /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/u.test(value),
  );
}

function localPreviewHost(location = globalThis.location) {
  return Boolean(
    location &&
      ["localhost", "127.0.0.1", "::1"].includes(
        String(location.hostname || ""),
      ),
  );
}

export function shouldUseLocalStoryApi(location = globalThis.location) {
  return localPreviewHost(location);
}

export function resolveStoryApiEndpoint(location = globalThis.location) {
  if (localPreviewHost(location)) {
    return storyApiUrl(LOCAL_STORY_API_ORIGIN);
  }

  if (String(location?.origin || "") === PRODUCTION_FRONTEND_ORIGIN) {
    return storyApiUrl(PRODUCTION_STORY_API_ORIGIN);
  }

  return null;
}

export function shouldUseStoryApi(location = globalThis.location) {
  return resolveStoryApiEndpoint(location) !== null;
}

function explicitLanguage(profile, keys) {
  for (const key of keys) {
    const value = profile?.[key];
    if (value === undefined || value === null || String(value).trim() === "") {
      continue;
    }
    return {
      present: true,
      value: String(value).trim(),
      code: languageCodeFromName(value),
    };
  }
  return { present: false, value: "", code: null };
}

export function localStoryProfileCompatibility(profile = {}) {
  const narrative = explicitLanguage(profile, [
    "currentLanguage",
    "narrativeLanguage",
    "storyLanguage",
  ]);
  const learning = explicitLanguage(profile, [
    "targetLanguage",
    "learningLanguage",
  ]);
  const issues = [];

  if (!narrative.present || !learning.present) {
    issues.push("missing_language_selection");
  } else if (!narrative.code || !learning.code) {
    issues.push("invalid_language_selection");
  } else if (
    !LOCAL_STORY_API_LANGUAGE_SET.has(narrative.code) ||
    !LOCAL_STORY_API_LANGUAGE_SET.has(learning.code)
  ) {
    issues.push("unsupported_language_pair");
  } else if (narrative.code === learning.code) {
    issues.push("same_language_pair");
  }

  if (!LOCAL_STORY_AGE_BANDS.includes(profile.ageBand)) {
    issues.push("unsupported_age_band");
  }

  if (!LOCAL_STORY_INTERESTS.includes(profile.interest)) {
    issues.push("unsupported_interest");
  }

  return Object.freeze({
    ok: issues.length === 0,
    issues: Object.freeze(issues),
    narrativeLanguage: narrative.code,
    learningLanguage: learning.code,
  });
}

export function localStoryLanguagePairSupported(profile = {}) {
  const compatibility = localStoryProfileCompatibility({
    ...profile,
    ageBand: LOCAL_STORY_AGE_BANDS[0],
    interest: LOCAL_STORY_INTERESTS[0],
  });
  return !compatibility.issues.some((issue) =>
    [
      "missing_language_selection",
      "invalid_language_selection",
      "unsupported_language_pair",
      "same_language_pair",
    ].includes(issue),
  );
}

export function migrateLocalStoryProfile(profile = {}) {
  const narrative = explicitLanguage(profile, [
    "currentLanguage",
    "narrativeLanguage",
    "storyLanguage",
  ]);
  const learning = explicitLanguage(profile, [
    "targetLanguage",
    "learningLanguage",
  ]);
  const blankProfile = !narrative.present && !learning.present;
  const narrativeLanguage = blankProfile ? "en" : narrative.code;
  const learningLanguage = blankProfile ? "es" : learning.code;

  const exactAge = Number(profile.childAge);
  const legacyAgeBand = Number.isInteger(exactAge) && exactAge >= 3
    ? exactAge <= 5
      ? "3-5"
      : exactAge <= 8
        ? "6-8"
        : exactAge <= 12
          ? "9-12"
          : ""
    : null;
  const hasSavedAgeBand =
    profile.ageBand !== undefined &&
    profile.ageBand !== null &&
    String(profile.ageBand).trim() !== "";
  const ageBand = hasSavedAgeBand
    ? String(profile.ageBand).trim()
    : legacyAgeBand;
  const hasSavedInterest =
    profile.interest !== undefined &&
    profile.interest !== null &&
    String(profile.interest).trim() !== "";
  const interest = hasSavedInterest
    ? String(profile.interest).trim()
    : "stars";
  const migrated = {
    ...profile,
    ageBand,
    interest,
  };
  if (narrativeLanguage) {
    migrated.currentLanguage = languageNameFromCode(narrativeLanguage);
    migrated.storyLanguage = narrativeLanguage;
    migrated.narrativeLanguage = narrativeLanguage;
  }
  if (learningLanguage) {
    migrated.targetLanguage = languageNameFromCode(learningLanguage);
    migrated.learningLanguage = learningLanguage;
  }
  delete migrated.childAge;
  return migrated;
}

function safeMockScenario(
  location = globalThis.location,
  storage = globalThis.localStorage,
) {
  if (!localPreviewHost(location)) return null;
  try {
    return (
      String(storage?.getItem("moontaleMockScenario") || "").trim() || null
    );
  } catch {
    return null;
  }
}

function cleanProfile(profile) {
  const languageConfig = resolveLanguageConfig(profile);
  const character = SUPPORTED_CHARACTERS.includes(profile.character)
    ? profile.character
    : "Astronaut";
  const mood = SUPPORTED_MOODS.includes(profile.mood)
    ? profile.mood
    : "Magical";
  const goal = SUPPORTED_GOALS.includes(profile.goal)
    ? profile.goal
    : "Courage";

  return {
    narrativeLanguage: languageConfig.narrativeLanguage,
    learningLanguage: languageConfig.learningLanguage,
    ageBand: LOCAL_STORY_AGE_BANDS.includes(profile.ageBand)
      ? profile.ageBand
      : "",
    character,
    mood,
    interest: LOCAL_STORY_INTERESTS.includes(profile.interest)
      ? profile.interest
      : "",
    goal,
    readingTime: normalizeReadingTime(profile.readingTime),
    newWordsCount: clampNewWordsCount(profile.newWordsCount),
  };
}

function validStory(value) {
  return Boolean(
    value &&
      typeof value === "object" &&
      typeof value.title === "string" &&
      value.title.trim() &&
      Array.isArray(value.paragraphs) &&
      value.paragraphs.length >= 1 &&
      value.paragraphs.length <= 32 &&
      value.paragraphs.every(
        (paragraph) => typeof paragraph === "string" && paragraph.trim(),
      ) &&
      typeof value.ending === "string" &&
      value.ending.trim() &&
      typeof value.parentTip === "string" &&
      value.parentTip.trim(),
  );
}

function validVocabulary(value, expectedCount) {
  return Boolean(
    Array.isArray(value) &&
      value.length === expectedCount &&
      value.every(
        (item) =>
          item &&
          typeof item.id === "string" &&
          typeof item.word === "string" &&
          item.word.trim() &&
          typeof item.meaning === "string" &&
          item.meaning.trim(),
      ),
  );
}

function newWordsTranslationKey(narrativeLanguage, count) {
  if (count === 1) return "story.newWords.one";
  if (narrativeLanguage === "pl" && count === 5) return "story.newWords.five";
  return "story.newWords.many";
}

function presentationMetadata(profile, vocabulary) {
  const narrativeLanguage = profile.narrativeLanguage;
  const learningLanguageName = languageNameFromCode(profile.learningLanguage);
  const narrativeLanguageName = languageNameFromCode(narrativeLanguage);
  const localizedGoal = translateFor(
    narrativeLanguage,
    `option.goal.${profile.goal}`,
  );
  const newWordsLabel = translateFor(
    narrativeLanguage,
    newWordsTranslationKey(narrativeLanguage, profile.newWordsCount),
    { count: profile.newWordsCount },
  );

  return {
    readingTime: translateFor(narrativeLanguage, "story.readingTime", {
      minutes: profile.readingTime,
    }),
    languageMeta: translateFor(narrativeLanguage, "story.languageMeta", {
      language: translateFor(
        narrativeLanguage,
        `language.${learningLanguageName}`,
      ),
      words: newWordsLabel,
    }),
    vocabularyIntro: translateFor(
      narrativeLanguage,
      "story.generated.vocabIntro",
      {
        targetLanguage: translateFor(
          narrativeLanguage,
          `language.${learningLanguageName}`,
        ),
        siteLanguage: translateFor(
          narrativeLanguage,
          `language.${narrativeLanguageName}`,
        ),
      },
    ),
    learningGoal: translateFor(narrativeLanguage, "story.generated.goalLine", {
      goal: localizedGoal,
      lesson: translateFor(narrativeLanguage, `story.lesson.${profile.goal}`),
    }),
    vocabulary,
  };
}

export async function requestLocalStory(profile, options = {}) {
  const compatibility = localStoryProfileCompatibility(profile);
  if (!compatibility.ok) {
    const languageIssue = compatibility.issues.some((issue) =>
      [
        "missing_language_selection",
        "invalid_language_selection",
        "unsupported_language_pair",
        "same_language_pair",
      ].includes(issue),
    );
    throw new StoryApiError(
      languageIssue ? "unsupported_language_pair" : "invalid_request",
      false,
    );
  }
  const clean = cleanProfile(profile);
  const selection = selectVocabularyWithMetadata(
    clean.learningLanguage,
    clean.newWordsCount,
    clean.narrativeLanguage,
    {
      character: clean.character,
      mood: clean.mood,
      seed: profile.storyGenerationId || "moontale-local-story",
    },
  );
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort("timeout"),
    options.timeoutMs || REQUEST_TIMEOUT_MS,
  );
  const abortFromCaller = () => controller.abort("superseded");
  options.signal?.addEventListener("abort", abortFromCaller, { once: true });

  try {
    const headers = { "content-type": "application/json" };
    const scenario = options.scenario || safeMockScenario();
    if (scenario) headers["x-moontale-mock-scenario"] = scenario;

    const endpoint =
      options.endpoint ||
      resolveStoryApiEndpoint(options.location) ||
      storyApiUrl(LOCAL_STORY_API_ORIGIN);
    if (new URL(endpoint).origin === PRODUCTION_STORY_API_ORIGIN) {
      const accessToken = await options.accessTokenProvider?.();
      if (!validAccessToken(accessToken)) {
        throw new StoryApiError("pilot_authorization_required", false);
      }
      headers.authorization = `Bearer ${accessToken}`;
    }

    const response = await (options.fetchImpl || fetch)(endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify({
        requestId: createRequestId(),
        profile: clean,
        targetVocabularyIds: selection.words.map((item) => item.id),
        adultAuthorization: {
          confirmed: profile.adultAuthorization?.confirmed === true,
          ...LOCAL_STORY_ADULT_AUTHORIZATION,
        },
      }),
      signal: controller.signal,
      cache: "no-store",
      credentials: "omit",
    });
    let body;
    try {
      body = await response.json();
    } catch {
      throw new StoryApiError("provider_invalid_response", true);
    }

    if (
      !response.ok ||
      body?.schemaVersion !== API_VERSION ||
      body?.status !== "passed"
    ) {
      const retryAfterHeader = response.headers.get("retry-after");
      const retryAfterSeconds = /^\d{1,5}$/u.test(retryAfterHeader || "")
        ? Number(retryAfterHeader)
        : null;
      const code =
        typeof body?.error?.code === "string"
          ? body.error.code
          : "generation_failed";
      throw new StoryApiError(
        code,
        body?.error?.retryable !== false,
        retryAfterSeconds,
      );
    }
    if (
      !validStory(body.story) ||
      !validVocabulary(body.vocabulary, clean.newWordsCount)
    ) {
      throw new StoryApiError("provider_invalid_response", true);
    }

    return {
      ...body.story,
      ...presentationMetadata(clean, body.vocabulary),
      metadata: {
        interfaceLanguage: resolveLanguageConfig(profile).interfaceLanguage,
        narrativeLanguage: clean.narrativeLanguage,
        learningLanguage: clean.learningLanguage,
        readingTime: clean.readingTime,
        requestedVocabularyCount: clean.newWordsCount,
        character: clean.character,
        mood: clean.mood,
        goal: clean.goal,
        generationId: body.generationId,
        storyGenerationId: String(
          profile.storyGenerationId || body.generationId || "",
        ).trim(),
        repaired: body.metadata?.repaired === true,
        source: "candidate17-local-worker",
      },
    };
  } catch (error) {
    if (error instanceof StoryApiError) throw error;
    if (controller.signal.aborted)
      throw new StoryApiError("provider_timeout", true);
    throw new StoryApiError("provider_unavailable", true);
  } finally {
    clearTimeout(timeout);
    options.signal?.removeEventListener("abort", abortFromCaller);
  }
}

export function createStoryRequestController(options = {}) {
  let sequence = 0;
  let activeController = null;

  return {
    async generate(profile, requestOptions = {}) {
      sequence += 1;
      const requestSequence = sequence;
      activeController?.abort();
      activeController = new AbortController();

      try {
        const story = await requestLocalStory(profile, {
          ...options,
          ...requestOptions,
          signal: activeController.signal,
        });
        if (requestSequence !== sequence) throw new StaleStoryRequestError();
        return story;
      } catch (error) {
        if (requestSequence !== sequence) throw new StaleStoryRequestError();
        throw error;
      }
    },
    abort() {
      sequence += 1;
      activeController?.abort();
      activeController = null;
    },
  };
}
