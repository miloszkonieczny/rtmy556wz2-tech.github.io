import { VOCABULARY } from "../../../data/vocabulary.js";
import {
  DEFAULT_LEARNING_LANGUAGE,
  LANGUAGE_NAME_BY_CODE,
  SUPPORTED_LANGUAGES,
  clampNewWordsCount,
  languageCodeFromName,
} from "../core/config.js?v=20260724-story-fix";

function hashSeed(seed) {
  let hash = 2166136261;
  for (const character of String(seed || "moontale")) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function createSeededRandom(seed) {
  let state = hashSeed(seed) || 1;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle(values, random) {
  const shuffled = [...values];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const targetIndex = Math.floor(random() * (index + 1));
    [shuffled[index], shuffled[targetIndex]] = [
      shuffled[targetIndex],
      shuffled[index],
    ];
  }
  return shuffled;
}

export function normalizeCanonicalLanguage(language) {
  const code = languageCodeFromName(language) || DEFAULT_LEARNING_LANGUAGE;
  return LANGUAGE_NAME_BY_CODE[code];
}

export function validateVocabularyData(vocabulary = VOCABULARY) {
  const errors = [];

  Object.entries(LANGUAGE_NAME_BY_CODE).forEach(
    ([languageCode, languageName]) => {
      const entries = vocabulary[languageName];
      if (!Array.isArray(entries) || entries.length < 5) {
        errors.push(
          `${languageName} must contain at least five vocabulary entries.`,
        );
        return;
      }

      const seenWords = new Set();
      entries.forEach((item, index) => {
        const label = `${languageName}[${index}]`;
        if (!item?.id || !item?.word)
          errors.push(`${label} must include id and word.`);
        if (seenWords.has(item?.word))
          errors.push(`${label} duplicates ${item.word}.`);
        seenWords.add(item?.word);
        if (!Array.isArray(item?.themes) || !item.themes.length)
          errors.push(`${label} must include themes.`);
        if (!Array.isArray(item?.moods) || !item.moods.length)
          errors.push(`${label} must include moods.`);
        SUPPORTED_LANGUAGES.forEach((meaningLanguage) => {
          if (!item?.meanings?.[meaningLanguage]) {
            errors.push(`${label} is missing a ${meaningLanguage} meaning.`);
          }
        });
        if (item?.meanings?.[languageCode] === undefined) {
          errors.push(`${label} is missing its native-language meaning.`);
        }
      });
    },
  );

  return errors;
}

export function selectVocabularyWithMetadata(
  language,
  count,
  meaningLanguage,
  options = {},
) {
  const canonicalLanguage = normalizeCanonicalLanguage(language);
  const learningLanguage =
    languageCodeFromName(canonicalLanguage) || DEFAULT_LEARNING_LANGUAGE;
  const narrativeLanguage = languageCodeFromName(meaningLanguage) || "en";
  const requestedCount = clampNewWordsCount(count);
  const entries = VOCABULARY[canonicalLanguage] || VOCABULARY.Spanish;
  const random = createSeededRandom(
    options.seed ||
      `${canonicalLanguage}:${options.character || ""}:${options.mood || ""}:${requestedCount}`,
  );

  const contextualEntries = entries.filter(
    (item) =>
      item.themes.includes(options.character) ||
      item.moods.includes(options.mood),
  );
  const contextualIds = new Set(contextualEntries.map((item) => item.id));
  const fallbackEntries = entries.filter((item) => !contextualIds.has(item.id));
  const selectedEntries = [
    ...shuffle(contextualEntries, random).slice(0, requestedCount),
    ...shuffle(fallbackEntries, random),
  ].slice(0, requestedCount);

  return {
    words: selectedEntries.map((item) => ({
      id: item.id,
      word: item.word,
      meaning: item.meanings[narrativeLanguage] || item.meanings.en,
    })),
    metadata: {
      canonicalLanguage,
      learningLanguage,
      meaningLanguage: narrativeLanguage,
      requestedCount,
      usedFallbackPool: contextualEntries.length < requestedCount,
    },
  };
}

export function selectVocabulary(
  language,
  count,
  meaningLanguage,
  options = {},
) {
  return selectVocabularyWithMetadata(language, count, meaningLanguage, options)
    .words;
}
