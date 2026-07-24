export const DEFAULT_LANGUAGE = "en";
export const DEFAULT_LEARNING_LANGUAGE = "es";

export const SUPPORTED_LANGUAGES = Object.freeze([
  "en",
  "pl",
  "es",
  "fr",
  "de",
]);
export const LANGUAGE_NAME_BY_CODE = Object.freeze({
  en: "English",
  pl: "Polish",
  es: "Spanish",
  fr: "French",
  de: "German",
});
export const SUPPORTED_CHARACTERS = Object.freeze([
  "Astronaut",
  "Dinosaur",
  "Princess",
  "Animal",
  "Robot",
]);
export const SUPPORTED_MOODS = Object.freeze([
  "Calm",
  "Magical",
  "Funny",
  "Adventurous",
]);
export const SUPPORTED_GOALS = Object.freeze([
  "Language learning",
  "Build reading habit",
  "Improve bedtime routine",
  "Confidence",
  "Courage",
  "Kindness",
]);
export const SUPPORTED_READING_TIMES = Object.freeze(["3", "5", "8"]);

export const LANGUAGE_STORAGE_KEY = "moontaleLanguage";
export const PROFILE_STORAGE_KEY = "moontaleStoryProfile";
export const SAVED_STORIES_KEY = "moontaleSavedStories";
export const MAX_SAVED_STORIES = 10;

export const STORY_BUILDER_URL = "./story-builder.html";
export const STORY_PAGE_URL = "./story.html";
export const STORY_BUILDER_FORMSPREE_TIMEOUT_MS = 4000;

const LANGUAGE_CODE_BY_NAME = Object.freeze(
  Object.fromEntries(
    Object.entries(LANGUAGE_NAME_BY_CODE).map(([code, name]) => [
      name.toLowerCase(),
      code,
    ]),
  ),
);

const READING_TIME_RANGES = Object.freeze({
  3: Object.freeze({ min: 260, max: 430 }),
  5: Object.freeze({ min: 380, max: 580 }),
  8: Object.freeze({ min: 500, max: 720 }),
});

function normalizeLanguageCandidate(language) {
  const value = String(language || "")
    .trim()
    .toLowerCase();
  if (SUPPORTED_LANGUAGES.includes(value)) return value;
  return LANGUAGE_CODE_BY_NAME[value] || null;
}

export function isSupportedLanguage(language) {
  return SUPPORTED_LANGUAGES.includes(
    String(language || "")
      .trim()
      .toLowerCase(),
  );
}

export function languageCodeFromName(language) {
  return normalizeLanguageCandidate(language);
}

export function languageNameFromCode(language) {
  const code = normalizeLanguageCandidate(language);
  return code
    ? LANGUAGE_NAME_BY_CODE[code]
    : LANGUAGE_NAME_BY_CODE[DEFAULT_LANGUAGE];
}

export function normalizeLanguageCode(language, fallback = DEFAULT_LANGUAGE) {
  return (
    normalizeLanguageCandidate(language) ||
    normalizeLanguageCandidate(fallback) ||
    DEFAULT_LANGUAGE
  );
}

export function clampNewWordsCount(value) {
  const parsedValue = Number.parseInt(String(value || ""), 10);
  if (!Number.isFinite(parsedValue)) return 3;
  return Math.min(5, Math.max(1, parsedValue));
}

export function normalizeReadingTime(value) {
  const readingTime = String(value || "");
  return SUPPORTED_READING_TIMES.includes(readingTime) ? readingTime : "5";
}

export function readingTimeRange(value) {
  return READING_TIME_RANGES[normalizeReadingTime(value)];
}

export function resolveLanguageConfig(
  profile = {},
  interfaceFallback = DEFAULT_LANGUAGE,
) {
  const rawInterfaceLanguage =
    profile.interfaceLanguage ??
    profile.websiteLanguage ??
    interfaceFallback ??
    DEFAULT_LANGUAGE;
  const rawNarrativeLanguage =
    profile.narrativeLanguage ??
    profile.storyLanguage ??
    profile.currentLanguage ??
    DEFAULT_LANGUAGE;
  const rawLearningLanguage =
    profile.learningLanguage ??
    profile.targetLanguage ??
    DEFAULT_LEARNING_LANGUAGE;

  const interfaceLanguage =
    normalizeLanguageCandidate(rawInterfaceLanguage) || DEFAULT_LANGUAGE;
  const narrativeLanguage =
    normalizeLanguageCandidate(rawNarrativeLanguage) || DEFAULT_LANGUAGE;
  const learningLanguage =
    normalizeLanguageCandidate(rawLearningLanguage) ||
    DEFAULT_LEARNING_LANGUAGE;

  return {
    interfaceLanguage,
    narrativeLanguage,
    learningLanguage,
    interfaceLanguageName: languageNameFromCode(interfaceLanguage),
    narrativeLanguageName: languageNameFromCode(narrativeLanguage),
    learningLanguageName: languageNameFromCode(learningLanguage),
    fallbacks: {
      interfaceLanguage:
        normalizeLanguageCandidate(rawInterfaceLanguage) === null,
      narrativeLanguage:
        normalizeLanguageCandidate(rawNarrativeLanguage) === null,
      learningLanguage:
        normalizeLanguageCandidate(rawLearningLanguage) === null,
    },
  };
}

export function resolveStoryLanguage(profile = {}) {
  return resolveLanguageConfig(profile).narrativeLanguage;
}
