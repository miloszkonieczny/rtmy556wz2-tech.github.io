import { STORY_BUILDER_URL } from "../core/config.js?v=20260724-story-fix";
import { initializeBrowserDataDeletionControls } from "../core/browser-data.js";
import { initializeCookieConsent } from "../core/cookie-consent.js";
import { createStoryParagraph, initializeRevealElements } from "../core/dom.js";
import { initializeLanguageSelectors, updateTranslatedContent } from "../core/i18n.js?v=20260724-story-fix";
import { initializeSiteNavigation } from "../core/navigation.js";
import { readStoredProfile, saveGeneratedStory } from "../core/storage.js";
import { initializeFormspreeForms } from "../services/formspree.js";
import { generateStory } from "../services/story-generator.js?v=20260724-story-fix";
import { createStoryService } from "../services/stories.js";
import { getSupabaseClient } from "../supabase-config.js?v=20260726-token-recovery";

function renderVocabularyList(vocabularyList, vocabulary) {
  if (!vocabularyList) return;

  vocabularyList.replaceChildren();
  vocabulary.forEach((item) => {
    const row = document.createElement("div");
    const term = document.createElement("dt");
    const definition = document.createElement("dd");
    term.textContent = item.word;
    definition.textContent = item.meaning;
    row.append(term, definition);
    vocabularyList.appendChild(row);
  });
}

function storyContentText(story) {
  return [...story.paragraphs, story.ending]
    .map((paragraph) => String(paragraph || "").trim())
    .filter(Boolean)
    .join("\n\n");
}

function storyVocabularyWords(story) {
  if (!Array.isArray(story.vocabulary)) {
    return [];
  }

  return story.vocabulary
    .map((item) => String(item?.word || "").trim())
    .filter(Boolean);
}

async function saveStoryToAccount(story, profile) {
  if (!profile.childProfileId) {
    return;
  }

  try {
    const client = getSupabaseClient();
    const sessionResult = await client.auth.getSession();

    if (
      sessionResult.error ||
      !sessionResult.data.session?.user
    ) {
      return;
    }

    const storyService = createStoryService(client);

    await storyService.create({
      childId: profile.childProfileId,
      title: story.title,
      storyContent: storyContentText(story),
      topic: profile.interest || profile.goal || "",
      targetLanguage:
        story.metadata?.learningLanguage ||
        profile.targetLanguage,
      vocabulary: storyVocabularyWords(story),
    });
  } catch (error) {
    console.warn(
      "MoonTale account story saving failed.",
      error,
    );
  }
}

async function renderStoryPage(options = {}) {
  const storyContent = document.querySelector("#story-content");
  if (!storyContent) return;

  const profile = readStoredProfile();
  if (!profile) {
    window.location.replace(STORY_BUILDER_URL);
    return;
  }

  const story = generateStory(profile);
  const storyTitle = document.querySelector("#story-title");
  const readingTime = document.querySelector("#story-reading-time");
  const storyLanguage = document.querySelector("#story-language");
  const vocabularyIntro = document.querySelector("#vocabulary-language");
  const learningGoal = document.querySelector("#learning-goal");
  const parentTip = document.querySelector("#parent-tip");
  const vocabularyList = document.querySelector("#vocabulary-list");
  const storyEnding = document.querySelector(".story-ending");

  document.title = `${story.title} - MoonTale`;
  if (storyTitle) storyTitle.textContent = story.title;
  if (readingTime) readingTime.textContent = story.readingTime;
  if (storyLanguage) storyLanguage.textContent = story.languageMeta;
  if (vocabularyIntro) vocabularyIntro.textContent = story.vocabularyIntro;
  if (learningGoal) learningGoal.textContent = story.learningGoal;
  if (parentTip) parentTip.textContent = story.parentTip;
  if (storyEnding) storyEnding.textContent = story.ending;

  storyContent.replaceChildren();
  story.paragraphs.forEach((paragraph) => {
    storyContent.appendChild(createStoryParagraph(paragraph));
  });

  renderVocabularyList(vocabularyList, story.vocabulary);

  if (options.save !== false) {
    saveGeneratedStory(story, profile);
    await saveStoryToAccount(story, profile);
  }
}

document.addEventListener("DOMContentLoaded", () => {
  initializeSiteNavigation();
  initializeCookieConsent();
  initializeLanguageSelectors({
    onLanguageChange: () => {
      void renderStoryPage({ save: false });
    },
  });
  updateTranslatedContent();
  initializeRevealElements();
  initializeFormspreeForms();
  initializeBrowserDataDeletionControls();
  void renderStoryPage({ save: true });
});
