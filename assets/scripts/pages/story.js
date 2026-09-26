import { STORY_BUILDER_URL } from "../core/config.js?v=20260724-story-fix";
import { initializeBrowserDataDeletionControls } from "../core/browser-data.js";
import { initializeCookieConsent } from "../core/cookie-consent.js";
import { createStoryParagraph, initializeRevealElements } from "../core/dom.js";
import {
  initializeLanguageSelectors,
  translate,
  updateTranslatedContent,
} from "../core/i18n.js?v=20260724-story-fix";
import { initializeSiteNavigation } from "../core/navigation.js";
import { readStoredProfile, saveGeneratedStory } from "../core/storage.js";
import { initializeFormspreeForms } from "../services/formspree.js";
import {
  StaleStoryRequestError,
  createStoryRequestController,
  localStoryProfileCompatibility,
  shouldUseStoryApi,
} from "../services/story-api.js";
import { generateStory as generateTemplateStory } from "../services/story-generator.js?v=20260724-story-fix";
import { createStoryService } from "../services/stories.js";
import {
  beginStorySave,
  clearStorySaveState,
  markStorySaved,
} from "../services/story-save-state.js";
import {
  loadOrGenerateAcceptedStory,
  storyErrorState,
} from "../services/story-state.js";
import { getSupabaseClient } from "../supabase-config.js?v=20260726-token-recovery";

async function currentStoryAccessToken() {
  const client = getSupabaseClient();
  const result = await client.auth.getSession();
  if (result.error) return null;
  const accessToken = result.data.session?.access_token;
  return typeof accessToken === "string" ? accessToken : null;
}

const storyRequestController = createStoryRequestController({
  accessTokenProvider: currentStoryAccessToken,
});
let currentStory = null;
let storyIsLoading = false;
let currentErrorTranslationKey = "story.error.generationFailure";

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

  const storyGenerationId = String(profile.storyGenerationId || "").trim();
  if (!storyGenerationId) {
    return;
  }
  const saveDecision = beginStorySave(storyGenerationId, localStorage);
  if (!saveDecision.shouldSave) {
    return;
  }

  try {
    const client = getSupabaseClient();
    const sessionResult = await client.auth.getSession();

    if (sessionResult.error || !sessionResult.data.session?.user) {
      clearStorySaveState(storyGenerationId, localStorage);
      return;
    }

    const storyService = createStoryService(client);

    await storyService.create({
      childId: profile.childProfileId,
      title: story.title,
      storyContent: storyContentText(story),
      topic: profile.interest || profile.goal || "",
      targetLanguage:
        story.metadata?.learningLanguage || profile.targetLanguage,
      vocabulary: storyVocabularyWords(story),
    });

    markStorySaved(storyGenerationId, localStorage);
  } catch (error) {
    clearStorySaveState(storyGenerationId, localStorage);

    console.warn("MoonTale account story saving failed.", error);
  }
}

function setStoryState(state, message = "") {
  const storyState = document.querySelector("#story-state");
  const storyStateMessage = document.querySelector("#story-state-message");
  const storyRetry = document.querySelector("#story-retry");
  const storyLayout = document.querySelector(".story-layout");

  document.body.dataset.storyState = state;
  storyLayout?.setAttribute(
    "aria-busy",
    state === "loading" ? "true" : "false",
  );

  if (!storyState || !storyStateMessage || !storyRetry) return;
  storyState.hidden = state === "success";
  storyState.dataset.state = state;
  storyStateMessage.textContent = message;
  storyRetry.hidden = state !== "error";
}

function clearRenderedStory() {
  document.querySelector("#story-content")?.replaceChildren();
  document.querySelector("#vocabulary-list")?.replaceChildren();
  const readingTime = document.querySelector("#story-reading-time");
  if (readingTime) {
    readingTime.textContent = "";
    readingTime.hidden = true;
  }
  for (const selector of [
    "#vocabulary-language",
    "#learning-goal",
    "#parent-tip",
    ".story-ending",
  ]) {
    const element = document.querySelector(selector);
    if (element) element.textContent = "";
  }
}

function renderStory(story) {
  const storyContent = document.querySelector("#story-content");
  if (!storyContent) return;
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
  if (readingTime) {
    readingTime.textContent = story.readingTime;
    readingTime.hidden = false;
  }
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
  setStoryState("success");
}

async function renderStoryPage(options = {}) {
  const storyContent = document.querySelector("#story-content");
  if (!storyContent) return;

  const profile = readStoredProfile();
  if (!profile) {
    window.location.replace(STORY_BUILDER_URL);
    return;
  }
  if (shouldUseStoryApi() && !localStoryProfileCompatibility(profile).ok) {
    window.location.replace(STORY_BUILDER_URL);
    return;
  }

  if (currentStory && options.regenerate !== true) {
    renderStory(currentStory);
    return;
  }
  if (storyIsLoading) return;

  storyIsLoading = true;
  clearRenderedStory();
  setStoryState("loading", translate("story.state.loading"));
  currentErrorTranslationKey = "story.error.generationFailure";

  try {
    const resolved = await loadOrGenerateAcceptedStory({
      profile,
      storage: localStorage,
      regenerate: options.regenerate === true,
      generate: () =>
        shouldUseStoryApi()
          ? storyRequestController.generate(profile)
          : Promise.resolve(generateTemplateStory(profile)),
    });
    const story = resolved.story;
    currentStory = story;
    renderStory(story);

    if (options.save !== false) {
      saveGeneratedStory(story, profile);
      await saveStoryToAccount(story, profile);
    }
  } catch (error) {
    if (error instanceof StaleStoryRequestError) return;
    currentStory = null;
    clearRenderedStory();
    const storyTitle = document.querySelector("#story-title");
    if (storyTitle)
      storyTitle.textContent = translate("story.state.errorTitle");
    const errorState = storyErrorState(error);
    currentErrorTranslationKey = errorState.translationKey;
    setStoryState("error", translate(errorState.translationKey));
  } finally {
    storyIsLoading = false;
  }
}

document.addEventListener("DOMContentLoaded", () => {
  initializeSiteNavigation();
  initializeCookieConsent();
  initializeLanguageSelectors({
    onLanguageChange: () => {
      if (currentStory) renderStory(currentStory);
      else if (storyIsLoading)
        setStoryState("loading", translate("story.state.loading"));
      else if (!storyIsLoading)
        setStoryState("error", translate(currentErrorTranslationKey));
    },
  });
  updateTranslatedContent();
  initializeRevealElements();
  initializeFormspreeForms();
  initializeBrowserDataDeletionControls();
  document.querySelector("#story-retry")?.addEventListener("click", () => {
    if (storyIsLoading) return;
    currentStory = null;
    void renderStoryPage({ save: true, regenerate: true });
  });
  void renderStoryPage({ save: true });
});
