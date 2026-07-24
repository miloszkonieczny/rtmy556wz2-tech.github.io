import { STORY_BUILDER_URL } from "../core/config.js?v=20260724-story-fix";
import { initializeBrowserDataDeletionControls } from "../core/browser-data.js";
import { initializeCookieConsent } from "../core/cookie-consent.js";
import { createStoryParagraph, initializeRevealElements } from "../core/dom.js";
import { initializeLanguageSelectors, updateTranslatedContent } from "../core/i18n.js?v=20260724-story-fix";
import { initializeSiteNavigation } from "../core/navigation.js";
import { readStoredProfile, saveGeneratedStory } from "../core/storage.js";
import { initializeFormspreeForms } from "../services/formspree.js";
import { generateStory } from "../services/story-generator.js?v=20260724-story-fix";

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

function renderStoryPage(options = {}) {
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

  if (options.save !== false) saveGeneratedStory(story, profile);
}

document.addEventListener("DOMContentLoaded", () => {
  initializeSiteNavigation();
  initializeCookieConsent();
  initializeLanguageSelectors({
    onLanguageChange: () => renderStoryPage({ save: false }),
  });
  updateTranslatedContent();
  initializeRevealElements();
  initializeFormspreeForms();
  initializeBrowserDataDeletionControls();
  renderStoryPage({ save: true });
});
