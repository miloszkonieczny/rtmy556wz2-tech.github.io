import {
  readJsonStorage,
  writeJsonStorage,
} from "../core/storage.js";

export const ACCEPTED_STORY_STORAGE_PREFIX =
  "moontaleAcceptedStory:";
const ACCEPTED_STORY_SCHEMA_VERSION =
  "moontale-accepted-story-v1";

const ERROR_STATE_BY_API_CODE = Object.freeze({
  invalid_request: Object.freeze({
    code: "INVALID_CONFIGURATION",
    translationKey: "story.error.invalidConfiguration",
  }),
  duplicate_request: Object.freeze({
    code: "INVALID_CONFIGURATION",
    translationKey: "story.error.invalidConfiguration",
  }),
  pilot_authorization_required: Object.freeze({
    code: "INVALID_CONFIGURATION",
    translationKey: "story.error.pilotAuthorizationRequired",
  }),
  pilot_access_denied: Object.freeze({
    code: "INVALID_CONFIGURATION",
    translationKey: "story.error.pilotAccessDenied",
  }),
  unsupported_language_pair: Object.freeze({
    code: "UNSUPPORTED_LANGUAGE_PAIR",
    translationKey: "story.error.unsupportedLanguagePair",
  }),
  unsafe_input: Object.freeze({
    code: "UNSAFE_INPUT",
    translationKey: "story.error.unsuitableDetails",
  }),
  safety_block: Object.freeze({
    code: "SAFETY_BLOCK",
    translationKey: "story.error.unsuitableDetails",
  }),
  quality_block: Object.freeze({
    code: "QUALITY_BLOCK",
    translationKey: "story.error.qualityBlock",
  }),
  busy: Object.freeze({
    code: "PROVIDER_RATE_LIMIT",
    translationKey: "story.error.providerRateLimit",
  }),
  provider_rate_limited: Object.freeze({
    code: "PROVIDER_RATE_LIMIT",
    translationKey: "story.error.providerRateLimit",
  }),
  pilot_quota_exceeded: Object.freeze({
    code: "PROVIDER_RATE_LIMIT",
    translationKey: "story.error.providerRateLimit",
  }),
  provider_timeout: Object.freeze({
    code: "PROVIDER_TIMEOUT",
    translationKey: "story.error.providerTimeout",
  }),
  provider_unavailable: Object.freeze({
    code: "PROVIDER_UNAVAILABLE",
    translationKey: "story.error.providerUnavailable",
  }),
  pilot_admission_unavailable: Object.freeze({
    code: "PROVIDER_UNAVAILABLE",
    translationKey: "story.error.providerUnavailable",
  }),
  unavailable: Object.freeze({
    code: "PROVIDER_UNAVAILABLE",
    translationKey: "story.error.providerUnavailable",
  }),
  generation_failed: Object.freeze({
    code: "GENERATION_FAILURE",
    translationKey: "story.error.generationFailure",
  }),
  provider_invalid_response: Object.freeze({
    code: "GENERATION_FAILURE",
    translationKey: "story.error.generationFailure",
  }),
  story_rejected: Object.freeze({
    code: "GENERATION_FAILURE",
    translationKey: "story.error.generationFailure",
  }),
});

const UNKNOWN_ERROR_STATE = Object.freeze({
  code: "UNKNOWN_SAFE_FAILURE",
  translationKey: "story.error.generationFailure",
});

export function storyErrorState(error) {
  const apiCode =
    typeof error?.code === "string" ? error.code : "";
  return ERROR_STATE_BY_API_CODE[apiCode] || UNKNOWN_ERROR_STATE;
}

function generationId(profile) {
  const value = String(profile?.storyGenerationId || "").trim();
  return /^[A-Za-z0-9][A-Za-z0-9_-]{7,127}$/u.test(value)
    ? value
    : "";
}

export function acceptedStoryStorageKey(profile) {
  const id = generationId(profile);
  return id ? `${ACCEPTED_STORY_STORAGE_PREFIX}${id}` : "";
}

function cleanText(value) {
  const text = String(value || "").trim();
  return text || null;
}

function finalizedStoryForStorage(story, storyGenerationId) {
  if (!story || typeof story !== "object" || Array.isArray(story)) {
    return null;
  }
  const title = cleanText(story.title);
  const ending = cleanText(story.ending);
  const parentTip = cleanText(story.parentTip);
  const readingTime = cleanText(story.readingTime);
  const languageMeta = cleanText(story.languageMeta);
  const vocabularyIntro = cleanText(story.vocabularyIntro);
  const learningGoal = cleanText(story.learningGoal);
  const paragraphs = Array.isArray(story.paragraphs)
    ? story.paragraphs.map(cleanText).filter(Boolean)
    : [];
  const vocabulary = Array.isArray(story.vocabulary)
    ? story.vocabulary
        .map((item) => ({
          id: cleanText(item?.id) || "",
          word: cleanText(item?.word),
          meaning: cleanText(item?.meaning),
        }))
        .filter((item) => item.word && item.meaning)
    : [];

  if (
    !title ||
    !ending ||
    !parentTip ||
    !readingTime ||
    !languageMeta ||
    !vocabularyIntro ||
    !learningGoal ||
    paragraphs.length === 0
  ) {
    return null;
  }

  const metadata = story.metadata || {};
  return {
    title,
    paragraphs,
    ending,
    parentTip,
    readingTime,
    languageMeta,
    vocabularyIntro,
    learningGoal,
    vocabulary,
    metadata: {
      interfaceLanguage: cleanText(metadata.interfaceLanguage),
      narrativeLanguage: cleanText(metadata.narrativeLanguage),
      learningLanguage: cleanText(metadata.learningLanguage),
      readingTime: cleanText(metadata.readingTime),
      requestedVocabularyCount: Number.isInteger(
        metadata.requestedVocabularyCount,
      )
        ? metadata.requestedVocabularyCount
        : null,
      character: cleanText(metadata.character),
      mood: cleanText(metadata.mood),
      goal: cleanText(metadata.goal),
      generationId: cleanText(metadata.generationId),
      storyGenerationId,
      repaired: metadata.repaired === true,
      source: cleanText(metadata.source),
    },
  };
}

export function readAcceptedStory(profile, storage) {
  const key = acceptedStoryStorageKey(profile);
  if (!key) return null;
  const record = readJsonStorage(key, null, storage);
  if (
    record?.schemaVersion !== ACCEPTED_STORY_SCHEMA_VERSION ||
    record.storyGenerationId !== generationId(profile)
  ) {
    return null;
  }
  return finalizedStoryForStorage(
    record.story,
    record.storyGenerationId,
  );
}

export function writeAcceptedStory(
  story,
  profile,
  storage,
  now = Date.now(),
) {
  const key = acceptedStoryStorageKey(profile);
  const storyGenerationId = generationId(profile);
  if (!key || !storyGenerationId) return false;
  const finalizedStory = finalizedStoryForStorage(
    story,
    storyGenerationId,
  );
  if (!finalizedStory) return false;

  return writeJsonStorage(
    key,
    {
      schemaVersion: ACCEPTED_STORY_SCHEMA_VERSION,
      storyGenerationId,
      acceptedAt: new Date(now).toISOString(),
      story: finalizedStory,
    },
    storage,
  );
}

export async function loadOrGenerateAcceptedStory({
  profile,
  storage,
  generate,
  regenerate = false,
  now = Date.now(),
}) {
  if (!regenerate) {
    const cached = readAcceptedStory(profile, storage);
    if (cached) return { story: cached, source: "cache" };
  }

  const story = await generate();
  writeAcceptedStory(story, profile, storage, now);
  return { story, source: "generation" };
}
