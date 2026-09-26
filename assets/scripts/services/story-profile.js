import {
  languageCodeFromName,
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
  const currentLanguage = String(
    readFieldValue(form, "currentLanguage") || "",
  ).trim();
  const targetLanguage = String(
    readFieldValue(form, "targetLanguage") || "",
  ).trim();
  const narrativeLanguage = languageCodeFromName(currentLanguage) || "";
  const learningLanguage = languageCodeFromName(targetLanguage) || "";

  return {
    childName: String(readFieldValue(form, "childName") || "").trim(),
    ageBand: readFieldValue(form, "ageBand"),
    currentLanguage,
    targetLanguage,
    character: readFieldValue(form, "character"),
    mood: readFieldValue(form, "mood"),
    interest: String(readFieldValue(form, "interest") || "").trim(),
    goal: readFieldValue(form, "goal"),
    readingTime: readFieldValue(form, "readingTime"),
    newWordsCount: readFieldValue(form, "newWordsCount"),
    storyLanguage: narrativeLanguage,
    narrativeLanguage,
    learningLanguage,
    websiteLanguage: interfaceLanguage,
    interfaceLanguage,
  };
}

export function fillFormFromProfile(form, profile) {
  if (!profile) return;

  const languageConfig = resolveLanguageConfig(profile);
  const rawCurrentLanguage =
    profile.currentLanguage ??
    profile.narrativeLanguage ??
    profile.storyLanguage;
  const rawTargetLanguage =
    profile.targetLanguage ?? profile.learningLanguage;
  const currentLanguageCode = languageCodeFromName(rawCurrentLanguage);
  const targetLanguageCode = languageCodeFromName(rawTargetLanguage);
  const formValues = {
    ...profile,
    currentLanguage: currentLanguageCode
      ? languageNameFromCode(currentLanguageCode)
      : String(rawCurrentLanguage || "").trim(),
    targetLanguage: targetLanguageCode
      ? languageNameFromCode(targetLanguageCode)
      : String(rawTargetLanguage || "").trim(),
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
      if (
        field.tagName === "SELECT" &&
        String(value) &&
        !Array.from(field.options || []).some(
          (option) => option.value === String(value),
        )
      ) {
        const option = field.ownerDocument.createElement("option");
        option.value = String(value);
        option.textContent = String(value);
        option.dataset.savedUnsupportedValue = "true";
        field.appendChild(option);
      }
      field.value = value;
    }
  });
}
