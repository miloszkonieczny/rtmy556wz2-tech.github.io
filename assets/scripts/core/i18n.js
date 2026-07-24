import de from "../../../locales/de.js";
import en from "../../../locales/en.js";
import es from "../../../locales/es.js";
import fr from "../../../locales/fr.js";
import pl from "../../../locales/pl.js";
import {
  DEFAULT_LANGUAGE,
  SUPPORTED_LANGUAGES,
  normalizeLanguageCode,
} from "./config.js";
import { getCurrentLanguage, writeCurrentLanguage } from "./storage.js";

export const translations = Object.freeze({ en, pl, es, fr, de });

function interpolate(message, replacements = {}) {
  return String(message).replace(/\{(\w+)\}/g, (placeholder, key) =>
    Object.hasOwn(replacements, key) ? String(replacements[key]) : placeholder,
  );
}

export function translateFor(language, key, replacements = {}) {
  const languageCode = normalizeLanguageCode(language);
  const message =
    translations[languageCode]?.[key] ??
    translations[DEFAULT_LANGUAGE]?.[key] ??
    key;
  return interpolate(message, replacements);
}

export function translate(key, replacements = {}) {
  return translateFor(getCurrentLanguage(), key, replacements);
}

function resolveMessage(message, replacements) {
  const key = String(message || "");
  const language = getCurrentLanguage();
  if (
    translations[language]?.[key] !== undefined ||
    translations[DEFAULT_LANGUAGE]?.[key] !== undefined
  ) {
    return translateFor(language, key, replacements);
  }
  return interpolate(key, replacements);
}

export function setElementMessage(element, message, replacements = {}) {
  if (!element) return;
  element.textContent = resolveMessage(message, replacements);
}

export function clearElementMessage(element) {
  if (!element) return;
  element.textContent = "";
}

function updateAttributeTranslations(root, attribute, dataAttribute) {
  root.querySelectorAll(`[${dataAttribute}]`).forEach((element) => {
    const key = element.getAttribute(dataAttribute);
    if (key) element.setAttribute(attribute, translate(key));
  });
}

export function syncLanguageFormFields(root = document) {
  const currentLanguage = getCurrentLanguage();
  root
    .querySelectorAll("#website-language-field, [name='websiteLanguage']")
    .forEach((field) => {
      field.value = currentLanguage;
    });
}

export function updateTranslatedContent(root = document) {
  root.querySelectorAll("[data-i18n]").forEach((element) => {
    const key = element.dataset.i18n;
    if (key) element.textContent = translate(key);
  });

  updateAttributeTranslations(root, "placeholder", "data-i18n-placeholder");
  updateAttributeTranslations(root, "aria-label", "data-i18n-aria-label");
  updateAttributeTranslations(root, "alt", "data-i18n-alt");
  updateAttributeTranslations(root, "content", "data-i18n-content");

  const page = document.body?.dataset.page;
  const titleKey = {
    home: "meta.home.title",
    builder: "meta.builder.title",
    story: "meta.story.title",
    landing: "meta.personalizedStories.title",
  }[page];
  if (titleKey) document.title = translate(titleKey);

  const currentLanguage = getCurrentLanguage();
  root.querySelectorAll("[data-language-select]").forEach((select) => {
    select.value = currentLanguage;
  });
  document.documentElement.lang = currentLanguage;
  syncLanguageFormFields(root);
}

export function initializeLanguageSelectors(options = {}) {
  const currentLanguage = getCurrentLanguage();

  document.querySelectorAll("[data-language-select]").forEach((select) => {
    select.value = currentLanguage;
    if (select.dataset.languageSelectorInitialized === "true") return;
    select.dataset.languageSelectorInitialized = "true";

    select.addEventListener("change", () => {
      const selectedLanguage = normalizeLanguageCode(select.value);
      writeCurrentLanguage(selectedLanguage);
      updateTranslatedContent();

      if (typeof options.onLanguageChange === "function") {
        options.onLanguageChange(selectedLanguage);
      }
    });
  });
}

export function getAllMissingTranslationKeys() {
  const englishKeys = Object.keys(translations[DEFAULT_LANGUAGE]);
  const missingKeys = {};

  SUPPORTED_LANGUAGES.filter(
    (language) => language !== DEFAULT_LANGUAGE,
  ).forEach((language) => {
    const missing = englishKeys.filter(
      (key) => translations[language]?.[key] === undefined,
    );
    if (missing.length) missingKeys[language] = missing;
  });

  return missingKeys;
}
