import {
  languageNameFromCode,
  resolveLanguageConfig,
} from "../core/config.js?v=20260724-story-fix";
import { getCurrentLanguage } from "../core/storage.js";

function readFieldValue(form, name) {
  const field = form.elements[name];
  if (!field) return "";

  if (typeof RadioNodeList !== "undefined" && field instanceof RadioNodeList) {
    const checkedField = Array.from(field).find((input) => input.checked);
    return checkedField ? checkedField.value : "";
  }

  return field.value || "";
}

export function getFormProfile(form) {
  const interfaceLanguage = getCurrentLanguage();
  const languageConfig = resolveLanguageConfig(
    {
      currentLanguage: readFieldValue(form, "currentLanguage"),
      targetLanguage: readFieldValue(form, "targetLanguage"),
      websiteLanguage: interfaceLanguage,
      interfaceLanguage,
    },
    interfaceLanguage,
  );

  return {
    childName: String(readFieldValue(form, "childName") || "").trim(),
    childAge: readFieldValue(form, "childAge"),
    currentLanguage: languageNameFromCode(languageConfig.narrativeLanguage),
    targetLanguage: languageNameFromCode(languageConfig.learningLanguage),
    character: readFieldValue(form, "character"),
    mood: readFieldValue(form, "mood"),
    interest: String(readFieldValue(form, "interest") || "").trim(),
    goal: readFieldValue(form, "goal"),
    readingTime: readFieldValue(form, "readingTime"),
    newWordsCount: readFieldValue(form, "newWordsCount"),
    storyLanguage: languageConfig.narrativeLanguage,
    narrativeLanguage: languageConfig.narrativeLanguage,
    learningLanguage: languageConfig.learningLanguage,
    websiteLanguage: languageConfig.interfaceLanguage,
    interfaceLanguage: languageConfig.interfaceLanguage,
  };
}

export function fillFormFromProfile(form, profile) {
  if (!profile) return;

  const languageConfig = resolveLanguageConfig(profile);
  const formValues = {
    ...profile,
    currentLanguage: languageNameFromCode(languageConfig.narrativeLanguage),
    targetLanguage: languageNameFromCode(languageConfig.learningLanguage),
    websiteLanguage: languageConfig.interfaceLanguage,
  };

  Object.entries(formValues).forEach(([name, value]) => {
    const field = form.elements[name];
    if (!field || value === undefined || value === null) return;

    if (
      typeof RadioNodeList !== "undefined" &&
      field instanceof RadioNodeList
    ) {
      Array.from(field).forEach((input) => {
        if (input.value === String(value)) input.checked = true;
      });
    } else {
      field.value = value;
    }
  });
}
