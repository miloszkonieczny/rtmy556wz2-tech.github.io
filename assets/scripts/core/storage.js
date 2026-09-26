import { normalizeLanguageCode } from "./config.js";

const DEFAULT_LANGUAGE = "en";
const LANGUAGE_STORAGE_KEY = "moontaleLanguage";
const PROFILE_STORAGE_KEY = "moontaleStoryProfile";
const SAVED_STORIES_KEY = "moontaleSavedStories";
const MAX_SAVED_STORIES = 10;

const EXACT_AGE_TO_BAND = Object.freeze({
  3: "3-5",
  4: "3-5",
  5: "3-5",
  6: "6-8",
  7: "6-8",
  8: "6-8",
  9: "9-12",
  10: "9-12",
  11: "9-12",
  12: "9-12",
});

export function withoutExactChildAge(profile) {
  if (!profile || typeof profile !== "object" || Array.isArray(profile)) {
    return profile;
  }

  const sanitized = { ...profile };
  const legacyAge = Number(sanitized.childAge);
  if (!sanitized.ageBand && Number.isInteger(legacyAge)) {
    sanitized.ageBand = EXACT_AGE_TO_BAND[legacyAge] || "";
  }
  delete sanitized.childAge;
  return sanitized;
}

function getBrowserStorage(storage) {
  if (storage) return storage;
  try {
    return typeof window !== "undefined" ? window.localStorage : null;
  } catch (error) {
    return null;
  }
}

function encodeBinary(value) {
  if (typeof btoa === "function") return btoa(value);
  if (typeof Buffer !== "undefined") return Buffer.from(value, "binary").toString("base64");
  throw new Error("Base64 encoding is unavailable.");
}

function decodeBinary(value) {
  if (typeof atob === "function") return atob(value);
  if (typeof Buffer !== "undefined") return Buffer.from(value, "base64").toString("binary");
  throw new Error("Base64 decoding is unavailable.");
}

export function readStorageValue(key, fallback = null, storage) {
  const localStorage = getBrowserStorage(storage);
  if (!localStorage) return fallback;

  try {
    const value = localStorage.getItem(key);
    return value === null ? fallback : value;
  } catch (error) {
    return fallback;
  }
}

export function writeStorageValue(key, value, storage) {
  const localStorage = getBrowserStorage(storage);
  if (!localStorage) return false;

  try {
    localStorage.setItem(key, value);
    return true;
  } catch (error) {
    return false;
  }
}

export function readJsonStorage(key, fallback = null, storage) {
  const value = readStorageValue(key, null, storage);
  if (value === null) return fallback;

  try {
    return JSON.parse(value);
  } catch (error) {
    return fallback;
  }
}

export function writeJsonStorage(key, value, storage) {
  try {
    return writeStorageValue(key, JSON.stringify(value), storage);
  } catch (error) {
    return false;
  }
}

export function getCurrentLanguage(storage) {
  return normalizeLanguageCode(readStorageValue(LANGUAGE_STORAGE_KEY, "", storage)) || DEFAULT_LANGUAGE;
}

export function writeCurrentLanguage(language, storage) {
  const normalizedLanguage = normalizeLanguageCode(language);
  if (!normalizedLanguage) return false;
  return writeStorageValue(LANGUAGE_STORAGE_KEY, normalizedLanguage, storage);
}

export function encodeProfile(profile) {
  try {
    return encodeBinary(unescape(encodeURIComponent(JSON.stringify(profile))));
  } catch (error) {
    return "";
  }
}

export function decodeProfile(encodedProfile) {
  try {
    return JSON.parse(decodeURIComponent(escape(decodeBinary(encodedProfile))));
  } catch (error) {
    return null;
  }
}

export function readStoredProfile(options = {}) {
  const stored = readJsonStorage(PROFILE_STORAGE_KEY, null, options.storage);
  const sanitized = withoutExactChildAge(stored);
  if (stored && Object.hasOwn(stored, "childAge")) {
    writeJsonStorage(PROFILE_STORAGE_KEY, sanitized, options.storage);
  }
  return sanitized;
}

export function writeStoredProfile(profile, storage) {
  return writeJsonStorage(
    PROFILE_STORAGE_KEY,
    withoutExactChildAge(profile),
    storage,
  );
}

export function readSavedStories(storage) {
  const stories = readJsonStorage(SAVED_STORIES_KEY, [], storage);
  if (!Array.isArray(stories)) return [];

  const sanitized = stories.map((story) => ({
    ...story,
    profile: withoutExactChildAge(story?.profile),
  }));
  if (stories.some((story) => Object.hasOwn(story?.profile || {}, "childAge"))) {
    writeJsonStorage(SAVED_STORIES_KEY, sanitized, storage);
  }
  return sanitized;
}

export function saveGeneratedStory(story, profile, storage) {
  const storyGenerationId = String(
    profile?.storyGenerationId ||
      story?.metadata?.storyGenerationId ||
      "",
  ).trim();
  const savedStories = readSavedStories(storage);
  if (
    storyGenerationId &&
    savedStories.some(
      (saved) => saved.storyGenerationId === storyGenerationId,
    )
  ) {
    return false;
  }
  const nextStories = [
    {
      storyGenerationId: storyGenerationId || null,
      title: story.title,
      language: story.languageCode || DEFAULT_LANGUAGE,
      targetLanguage: profile.targetLanguage,
      createdAt: new Date().toISOString(),
      profile: withoutExactChildAge(profile),
    },
    ...savedStories,
  ].slice(0, MAX_SAVED_STORIES);

  return writeJsonStorage(SAVED_STORIES_KEY, nextStories, storage);
}
