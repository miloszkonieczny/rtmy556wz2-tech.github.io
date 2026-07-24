import test from "node:test";
import assert from "node:assert/strict";

import { STORY_CONTENT } from "../data/story-content.js";
import { VOCABULARY } from "../data/vocabulary.js";
import {
  DEFAULT_LANGUAGE,
  DEFAULT_LEARNING_LANGUAGE,
  LANGUAGE_NAME_BY_CODE,
  STORY_BUILDER_FORMSPREE_TIMEOUT_MS,
  STORY_PAGE_URL,
  SUPPORTED_CHARACTERS,
  SUPPORTED_LANGUAGES,
  SUPPORTED_MOODS,
  clampNewWordsCount,
  isSupportedLanguage,
  languageCodeFromName,
  languageNameFromCode,
  readingTimeRange,
  resolveLanguageConfig,
  resolveStoryLanguage,
} from "../assets/scripts/core/config.js";
import {
  getAllMissingTranslationKeys,
  translateFor,
  translations,
} from "../assets/scripts/core/i18n.js";
import { readJsonStorage } from "../assets/scripts/core/storage.js";
import { generateStory } from "../assets/scripts/services/story-generator.js";
import {
  fillFormFromProfile,
  getFormProfile,
} from "../assets/scripts/services/story-profile.js";
import {
  normalizeCanonicalLanguage,
  selectVocabulary,
  selectVocabularyWithMetadata,
  validateVocabularyData,
} from "../assets/scripts/services/vocabulary.js";
import {
  TemplateRenderError,
  findUnresolvedPlaceholders,
  renderTemplate,
} from "../assets/scripts/services/template-renderer.js";

class MemoryStorage {
  constructor(values = {}) {
    this.values = new Map(Object.entries(values));
  }

  getItem(key) {
    return this.values.has(key) ? this.values.get(key) : null;
  }

  setItem(key, value) {
    this.values.set(key, String(value));
  }
}

class ThrowingStorage {
  getItem() {
    throw new Error("localStorage is unavailable");
  }

  setItem() {
    throw new Error("localStorage is unavailable");
  }
}

const completeProfile = {
  childName: "Milo",
  childAge: "6",
  currentLanguage: "English",
  targetLanguage: "Spanish",
  character: "Astronaut",
  mood: "Magical",
  interest: "stars",
  goal: "Language learning",
  readingTime: "5",
  newWordsCount: "3",
};

function allStoryText(story) {
  return [
    story.title,
    ...story.paragraphs,
    story.ending,
    story.learningGoal,
    story.parentTip,
  ].join(" ");
}

test("supported-language validation accepts known codes and rejects unknown codes", () => {
  SUPPORTED_LANGUAGES.forEach((language) =>
    assert.equal(isSupportedLanguage(language), true),
  );
  assert.equal(isSupportedLanguage("it"), false);
});

test("language-name to code conversion handles supported display names", () => {
  assert.equal(languageCodeFromName("English"), "en");
  assert.equal(languageCodeFromName("polish"), "pl");
  assert.equal(languageCodeFromName(" Spanish "), "es");
  assert.equal(languageCodeFromName("French"), "fr");
  assert.equal(languageCodeFromName("German"), "de");
  assert.equal(languageCodeFromName("Italian"), null);
});

test("builder configuration and profile services share a complete language contract", () => {
  assert.equal(STORY_PAGE_URL, "./story.html");
  assert.equal(STORY_BUILDER_FORMSPREE_TIMEOUT_MS > 0, true);
  assert.equal(languageNameFromCode("de"), "German");

  const form = {
    elements: {
      childName: { value: "  Nova  " },
      childAge: { value: "7" },
      currentLanguage: { value: "German" },
      targetLanguage: { value: "French" },
      character: { value: "Robot" },
      mood: { value: "Calm" },
      interest: { value: "  planets  " },
      goal: { value: "Confidence" },
      readingTime: { value: "5" },
      newWordsCount: { value: "3" },
      websiteLanguage: { value: "en" },
    },
  };

  const profile = getFormProfile(form);
  assert.equal(profile.childName, "Nova");
  assert.equal(profile.interest, "planets");
  assert.equal(profile.currentLanguage, "German");
  assert.equal(profile.targetLanguage, "French");
  assert.equal(profile.narrativeLanguage, "de");
  assert.equal(profile.learningLanguage, "fr");

  fillFormFromProfile(form, {
    currentLanguage: "pl",
    targetLanguage: "es",
    websiteLanguage: "de",
  });
  assert.equal(form.elements.currentLanguage.value, "Polish");
  assert.equal(form.elements.targetLanguage.value, "Spanish");
  assert.equal(form.elements.websiteLanguage.value, "de");
});

test("central language resolver keeps interface, narrative, and learning languages separate", () => {
  assert.deepEqual(
    resolveLanguageConfig(
      {
        websiteLanguage: "English",
        currentLanguage: "German",
        targetLanguage: "French",
      },
      "en",
    ),
    {
      interfaceLanguage: "en",
      narrativeLanguage: "de",
      learningLanguage: "fr",
      interfaceLanguageName: "English",
      narrativeLanguageName: "German",
      learningLanguageName: "French",
      fallbacks: {
        interfaceLanguage: false,
        narrativeLanguage: false,
        learningLanguage: false,
      },
    },
  );
});

test("invalid language values use documented fallbacks", () => {
  const config = resolveLanguageConfig({
    websiteLanguage: "Atlantis",
    currentLanguage: "Klingon",
    targetLanguage: "Elvish",
  });

  assert.equal(config.interfaceLanguage, DEFAULT_LANGUAGE);
  assert.equal(config.narrativeLanguage, DEFAULT_LANGUAGE);
  assert.equal(config.learningLanguage, DEFAULT_LEARNING_LANGUAGE);
  assert.equal(config.fallbacks.interfaceLanguage, true);
  assert.equal(config.fallbacks.narrativeLanguage, true);
  assert.equal(config.fallbacks.learningLanguage, true);
});

test("English translation fallback and missing key fallback stay safe", () => {
  assert.equal(translateFor("unknown", "common.email"), "Email");

  const original = translations.pl["common.email"];
  delete translations.pl["common.email"];
  try {
    assert.equal(translateFor("pl", "common.email"), "Email");
    assert.equal(translateFor("pl", "not.a.real.key"), "not.a.real.key");
  } finally {
    translations.pl["common.email"] = original;
  }
});

test("all supported locale files contain the English key set", () => {
  assert.deepEqual(getAllMissingTranslationKeys(), {});
});

test("safe localStorage parsing returns fallbacks for malformed JSON and storage exceptions", () => {
  assert.deepEqual(
    readJsonStorage(
      "profile",
      { safe: true },
      new MemoryStorage({ profile: "{bad json" }),
    ),
    {
      safe: true,
    },
  );
  assert.deepEqual(
    readJsonStorage("profile", { safe: true }, new ThrowingStorage()),
    { safe: true },
  );
});

test("template rendering resolves placeholders, sanitizes values, and fails clearly in strict mode", () => {
  assert.equal(
    renderTemplate("Hello {name}", { name: "<Ava & Milo>" }, { strict: true }),
    "Hello &lt;Ava &amp; Milo&gt;",
  );
  assert.throws(
    () => renderTemplate("Hello {unknown}", {}, { strict: true }),
    TemplateRenderError,
  );
  assert.equal(
    renderTemplate(
      "Hello {unknown}",
      {},
      { strict: false, fallbackValue: "friend" },
    ),
    "Hello friend",
  );
});

test("every story content component is a non-empty string with no unresolved placeholders after rendering", () => {
  const replacements = {
    name: "Ava",
    interest: "stars",
    character: "Robot",
    mood: "Magical",
    language: "Spanish",
    goal: "Language learning",
    wordCount: "3",
    wordPhrase: "luna (moon), estrella (star) and bosque (forest)",
  };

  Object.entries(STORY_CONTENT).forEach(([language, content]) => {
    assert.equal(typeof content.title, "string", `${language} title`);
    assert.equal(typeof content.ending, "string", `${language} ending`);
    Object.entries(content.beats).forEach(([key, template]) => {
      const rendered = renderTemplate(template, replacements, { strict: true });
      assert.notEqual(rendered.trim(), "", `${language}.${key}`);
      assert.deepEqual(findUnresolvedPlaceholders(rendered), []);
    });
    content.details.forEach((template, index) => {
      const rendered = renderTemplate(template, replacements, { strict: true });
      assert.notEqual(rendered.trim(), "", `${language}.details[${index}]`);
      assert.deepEqual(findUnresolvedPlaceholders(rendered), []);
    });
  });
});

test("vocabulary data validates for all five learning languages", () => {
  assert.deepEqual(validateVocabularyData(), []);
  assert.ok(
    validateVocabularyData({
      English: [{ word: "broken", meanings: { en: "broken" } }],
    }).length > 0,
  );
});

test("vocabulary selection respects count, learning language, meanings, duplicates, fallback, and deterministic seeds", () => {
  const first = selectVocabularyWithMetadata("Spanish", 5, "pl", {
    character: "Robot",
    mood: "Funny",
    seed: "vocab-seed",
  });
  const second = selectVocabularyWithMetadata("Spanish", 5, "pl", {
    character: "Robot",
    mood: "Funny",
    seed: "vocab-seed",
  });

  assert.equal(normalizeCanonicalLanguage("es"), "Spanish");
  assert.equal(first.words.length, 5);
  assert.equal(
    new Set(first.words.map((item) => item.word)).size,
    first.words.length,
  );
  assert.deepEqual(
    first.words.map((item) => item.word),
    second.words.map((item) => item.word),
  );
  assert.equal(first.metadata.learningLanguage, "es");
  assert.equal(first.metadata.usedFallbackPool, true);
  first.words.forEach((item) => assert.ok(item.meaning));
});

test("legacy selectVocabulary API remains compatible", () => {
  const words = selectVocabulary("Spanish", 2, "pl", { seed: "legacy" });
  assert.equal(words.length, 2);
  words.forEach((item) => assert.ok(item.word && item.meaning));
});

test("story-language resolution supports old stored full-name profiles", () => {
  assert.equal(
    resolveStoryLanguage({
      currentLanguage: "German",
      websiteLanguage: "English",
    }),
    "de",
  );
  assert.equal(resolveStoryLanguage({ storyLanguage: "Polish" }), "pl");
});

test("profile defaults handle missing and malformed values safely", () => {
  const story = generateStory(
    {
      childName: "",
      interest: "",
      currentLanguage: "Bad language",
      targetLanguage: "Bad language",
      readingTime: "20",
      newWordsCount: "99",
      character: "Alien",
      mood: "Wild",
    },
    { strictTemplates: true, seed: "malformed" },
  );

  assert.equal(story.languageCode, DEFAULT_LANGUAGE);
  assert.equal(story.metadata.learningLanguage, DEFAULT_LEARNING_LANGUAGE);
  assert.equal(story.metadata.readingTime, "5");
  assert.equal(
    story.metadata.requestedVocabularyCount,
    clampNewWordsCount("99"),
  );
  assert.equal(story.metadata.character, "Astronaut");
  assert.equal(story.metadata.mood, "Magical");
  assert.deepEqual(findUnresolvedPlaceholders(allStoryText(story)), []);
});

test("generated stories satisfy the story-page rendering contract without browser globals", () => {
  const story = generateStory(completeProfile, {
    strictTemplates: true,
    seed: "rendering-contract",
  });

  [
    story.title,
    story.readingTime,
    story.languageMeta,
    story.vocabularyIntro,
    story.learningGoal,
    story.parentTip,
    story.ending,
  ].forEach((value) =>
    assert.equal(typeof value === "string" && value.trim().length > 0, true),
  );
  assert.equal(
    Array.isArray(story.paragraphs) && story.paragraphs.length > 0,
    true,
  );
  assert.equal(
    Array.isArray(story.vocabulary) && story.vocabulary.length === 3,
    true,
  );
});

test("every supported narrative language generates non-empty localized text", () => {
  const expectedOpeningByLanguage = {
    en: "When the room",
    pl: "Kiedy pokój",
    es: "Cuando la habitación",
    fr: "Quand la chambre",
    de: "Als das Zimmer",
  };

  SUPPORTED_LANGUAGES.forEach((language) => {
    const story = generateStory(
      {
        ...completeProfile,
        currentLanguage: language,
        storyLanguage: language,
      },
      { strictTemplates: true, seed: `localized-${language}` },
    );

    assert.equal(story.languageCode, language);
    assert.match(
      story.paragraphs[0],
      new RegExp(expectedOpeningByLanguage[language]),
    );
    assert.notEqual(story.ending.trim(), "");
  });
});

test("non-English stories do not reuse unintended English template paragraphs", () => {
  ["pl", "es", "fr", "de"].forEach((language) => {
    const story = generateStory(
      {
        ...completeProfile,
        currentLanguage: language,
        storyLanguage: language,
        targetLanguage: "English",
      },
      { strictTemplates: true, seed: `non-english-${language}` },
    );

    assert.equal(
      allStoryText(story).includes("When the room grew quiet"),
      false,
    );
    assert.equal(allStoryText(story).includes("The map led them"), false);
  });
});

test("full story matrix preserves structure, selections, vocabulary, placeholders, and reading-time ranges", () => {
  const readingTimes = ["3", "5", "8"];
  const vocabularyCounts = ["1", "2", "3", "4", "5"];

  for (const character of SUPPORTED_CHARACTERS) {
    for (const mood of SUPPORTED_MOODS) {
      for (const narrativeLanguage of SUPPORTED_LANGUAGES) {
        for (const learningLanguage of SUPPORTED_LANGUAGES) {
          for (const newWordsCount of vocabularyCounts) {
            for (const readingTime of readingTimes) {
              const story = generateStory(
                {
                  ...completeProfile,
                  childName: "Ava",
                  currentLanguage: narrativeLanguage,
                  targetLanguage: learningLanguage,
                  character,
                  mood,
                  readingTime,
                  newWordsCount,
                },
                {
                  strictTemplates: true,
                  seed: `${character}:${mood}:${narrativeLanguage}:${learningLanguage}:${newWordsCount}:${readingTime}`,
                },
              );
              const expectedVocabulary = new Set(
                VOCABULARY[LANGUAGE_NAME_BY_CODE[learningLanguage]].map(
                  (item) => item.word,
                ),
              );
              const range = readingTimeRange(readingTime);

              assert.equal(story.languageCode, narrativeLanguage);
              assert.equal(story.metadata.character, character);
              assert.equal(story.metadata.mood, mood);
              assert.equal(story.metadata.learningLanguage, learningLanguage);
              assert.equal(story.vocabulary.length, Number(newWordsCount));
              assert.equal(
                new Set(story.vocabulary.map((item) => item.word)).size,
                story.vocabulary.length,
              );
              story.vocabulary.forEach((item) => {
                assert.equal(expectedVocabulary.has(item.word), true);
                assert.ok(item.meaning);
              });
              assert.deepEqual(
                findUnresolvedPlaceholders(allStoryText(story)),
                [],
              );
              assert.equal(story.metadata.actualWordCount >= range.min, true);
              assert.equal(story.metadata.actualWordCount <= range.max, true);
              assert.equal(story.metadata.withinReadingTarget, true);
            }
          }
        }
      }
    }
  }
});
