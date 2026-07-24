import {
  READING_TIME_DETAIL_COUNT,
  STORY_CONTENT,
} from "../../../data/story-content.js";
import {
  LANGUAGE_NAME_BY_CODE,
  SUPPORTED_CHARACTERS,
  SUPPORTED_GOALS,
  SUPPORTED_MOODS,
  clampNewWordsCount,
  languageNameFromCode,
  normalizeReadingTime,
  readingTimeRange,
  resolveLanguageConfig,
} from "../core/config.js?v=20260724-story-fix";
import { translateFor } from "../core/i18n.js?v=20260724-story-fix";
import {
  findUnresolvedPlaceholders,
  renderTemplate,
} from "./template-renderer.js";
import { selectVocabularyWithMetadata } from "./vocabulary.js";

const STORY_BEAT_ORDER = Object.freeze([
  "opening",
  "mission",
  "vocabulary",
  "interest",
  "obstacle",
  "action",
  "reward",
  "lesson",
]);

function cleanText(value, fallback, maximumLength = 80) {
  const cleanedValue = String(value || "")
    .replace(/[<>]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maximumLength);
  return cleanedValue || fallback;
}

function countWords(value) {
  return (
    String(value || "").match(/[\p{L}\p{N}]+(?:[’'-][\p{L}\p{N}]+)*/gu) || []
  ).length;
}

function createWordPhrase(words, narrativeLanguage) {
  const items = words.map((item) => `${item.word} (${item.meaning})`);
  if (items.length < 2) return items[0] || "";
  const conjunction = translateFor(narrativeLanguage, "list.and");
  if (items.length === 2) return `${items[0]} ${conjunction} ${items[1]}`;
  return `${items.slice(0, -1).join(", ")} ${conjunction} ${items.at(-1)}`;
}

function seedOffset(seed, length) {
  if (!length) return 0;
  let hash = 0;
  for (const character of String(seed || "moontale")) {
    hash = (Math.imul(hash, 31) + character.charCodeAt(0)) >>> 0;
  }
  return hash % length;
}

function lowercaseFirst(value) {
  const text = String(value || "");
  return text ? `${text.charAt(0).toLocaleLowerCase()}${text.slice(1)}` : text;
}

function newWordsTranslationKey(narrativeLanguage, count) {
  if (count === 1) return "story.newWords.one";
  if (narrativeLanguage === "pl" && count === 5) return "story.newWords.five";
  return "story.newWords.many";
}

function selectStoryDetails(details, count, seed) {
  if (!details.length || count <= 0) return [];
  const offset = seedOffset(seed, details.length);
  return Array.from(
    { length: Math.min(count, details.length) },
    (_unused, index) => details[(offset + index) % details.length],
  );
}

function render(template, replacements, options) {
  return renderTemplate(template, replacements, {
    strict: options.strictTemplates !== false,
    escape: false,
    fallbackValue: "friend",
  });
}

export function generateStory(profile = {}, options = {}) {
  const languageConfig = resolveLanguageConfig(profile);
  const narrativeLanguage = languageConfig.narrativeLanguage;
  const learningLanguage = languageConfig.learningLanguage;
  const interfaceLanguage = languageConfig.interfaceLanguage;
  const readingTime = normalizeReadingTime(profile.readingTime);
  const requestedVocabularyCount = clampNewWordsCount(profile.newWordsCount);
  const character = SUPPORTED_CHARACTERS.includes(profile.character)
    ? profile.character
    : "Astronaut";
  const mood = SUPPORTED_MOODS.includes(profile.mood)
    ? profile.mood
    : "Magical";
  const goal = SUPPORTED_GOALS.includes(profile.goal)
    ? profile.goal
    : "Courage";
  const childName = cleanText(
    profile.childName,
    translateFor(narrativeLanguage, "story.defaults.childName"),
    30,
  );
  const interest = cleanText(
    profile.interest,
    translateFor(narrativeLanguage, "story.defaults.interest"),
    50,
  );
  const learningLanguageName = languageNameFromCode(learningLanguage);
  const narrativeLanguageName = languageNameFromCode(narrativeLanguage);
  const vocabularySelection = selectVocabularyWithMetadata(
    learningLanguage,
    requestedVocabularyCount,
    narrativeLanguage,
    {
      character,
      mood,
      seed: options.seed,
    },
  );
  const wordPhrase = createWordPhrase(
    vocabularySelection.words,
    narrativeLanguage,
  );
  const content = STORY_CONTENT[narrativeLanguage] || STORY_CONTENT.en;
  const localizedCharacter = translateFor(
    narrativeLanguage,
    `option.character.${character}`,
  );
  const localizedMood = lowercaseFirst(
    translateFor(narrativeLanguage, `option.mood.${mood}`),
  );
  const localizedGoal = translateFor(narrativeLanguage, `option.goal.${goal}`);
  const replacements = {
    name: childName,
    childName,
    interest,
    character: localizedCharacter,
    mood: localizedMood,
    language: translateFor(
      narrativeLanguage,
      `language.${learningLanguageName}`,
    ),
    targetLanguage: translateFor(
      narrativeLanguage,
      `language.${learningLanguageName}`,
    ),
    siteLanguage: translateFor(
      narrativeLanguage,
      `language.${narrativeLanguageName}`,
    ),
    goal: localizedGoal,
    wordCount: requestedVocabularyCount,
    wordPhrase,
  };
  const details = selectStoryDetails(
    content.details,
    READING_TIME_DETAIL_COUNT[readingTime] || READING_TIME_DETAIL_COUNT[5],
    options.seed,
  );
  const paragraphs = [
    ...STORY_BEAT_ORDER.map((beat) =>
      render(content.beats[beat], replacements, options),
    ),
    ...details.map((detail) => render(detail, replacements, options)),
  ];
  const title = render(content.title, replacements, options);
  const ending = render(content.ending, replacements, options);
  const lesson = translateFor(narrativeLanguage, `story.lesson.${goal}`);
  const learningGoal = translateFor(
    narrativeLanguage,
    "story.generated.goalLine",
    {
      goal: localizedGoal,
      lesson,
    },
  );
  const parentTip = translateFor(
    narrativeLanguage,
    "story.generated.parentTip",
    replacements,
  );
  const readingTimeLabel = translateFor(
    narrativeLanguage,
    "story.readingTime",
    {
      minutes: readingTime,
    },
  );
  const newWordsLabel = translateFor(
    narrativeLanguage,
    newWordsTranslationKey(narrativeLanguage, requestedVocabularyCount),
    { count: requestedVocabularyCount },
  );
  const languageMeta = translateFor(narrativeLanguage, "story.languageMeta", {
    language: translateFor(
      narrativeLanguage,
      `language.${learningLanguageName}`,
    ),
    words: newWordsLabel,
  });
  const vocabularyIntro = translateFor(
    narrativeLanguage,
    "story.generated.vocabIntro",
    replacements,
  );
  const actualWordCount = countWords([title, ...paragraphs, ending].join(" "));
  const targetRange = readingTimeRange(readingTime);
  const unresolvedPlaceholders = findUnresolvedPlaceholders(
    [
      title,
      ...paragraphs,
      ending,
      learningGoal,
      parentTip,
      vocabularyIntro,
    ].join(" "),
  );

  if (options.strictTemplates !== false && unresolvedPlaceholders.length) {
    throw new Error(
      `Story contains unresolved placeholders: ${unresolvedPlaceholders.join(", ")}`,
    );
  }

  return {
    title,
    paragraphs,
    ending,
    vocabulary: vocabularySelection.words,
    readingTime: readingTimeLabel,
    languageCode: narrativeLanguage,
    languageMeta,
    vocabularyIntro,
    learningGoal,
    parentTip,
    metadata: {
      interfaceLanguage,
      narrativeLanguage,
      learningLanguage,
      readingTime,
      requestedVocabularyCount,
      character,
      mood,
      goal,
      actualWordCount,
      targetWordCount: targetRange,
      withinReadingTarget:
        actualWordCount >= targetRange.min &&
        actualWordCount <= targetRange.max,
      languageFallbacks: languageConfig.fallbacks,
      usedVocabularyFallbackPool: vocabularySelection.metadata.usedFallbackPool,
    },
  };
}
