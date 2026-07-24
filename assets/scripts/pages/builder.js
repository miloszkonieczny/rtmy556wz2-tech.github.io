import { STORY_BUILDER_FORMSPREE_TIMEOUT_MS, STORY_PAGE_URL } from "../core/config.js?v=20260724-story-fix";
import { initializeCookieConsent } from "../core/cookie-consent.js";
import { initializeRevealElements } from "../core/dom.js";
import {
  clearElementMessage,
  initializeLanguageSelectors,
  setElementMessage,
  syncLanguageFormFields,
  translate,
  updateTranslatedContent,
} from "../core/i18n.js?v=20260724-story-fix";
import { initializeSiteNavigation } from "../core/navigation.js";
import { readStoredProfile, writeStoredProfile } from "../core/storage.js";
import { trackStoryBuilderStart, trackStoryGenerated, trackWaitlistSubmission } from "../core/analytics.js";
import { buildMinimalWaitlistPayload, postMinimalWaitlistToFormspree } from "../services/formspree.js";
import { fillFormFromProfile, getFormProfile } from "../services/story-profile.js?v=20260724-story-fix";

function setFieldError(field, key) {
  const wrapper = field.closest(".field");
  const error = wrapper ? wrapper.querySelector(".field-error") : null;
  field.setAttribute("aria-invalid", "true");
  setElementMessage(error, key);
}

function clearStepErrors(step) {
  step.querySelectorAll("[aria-invalid='true']").forEach((field) => {
    field.removeAttribute("aria-invalid");
  });
  step.querySelectorAll(".field-error, .group-error").forEach(clearElementMessage);
}

function validateStep(step) {
  clearStepErrors(step);
  let isValid = true;

  step.querySelectorAll("input:not([type='radio']):not([type='checkbox']), select").forEach((field) => {
    if (!field.checkValidity()) {
      setFieldError(field, field.type === "email" && field.value ? "form.error.email" : "form.error.required");
      isValid = false;
    }
  });

  const radioNames = new Set(
    Array.from(step.querySelectorAll("input[type='radio'][required]")).map((input) => input.name),
  );

  radioNames.forEach((name) => {
    if (!step.querySelector(`input[name="${name}"]:checked`)) {
      setElementMessage(step.querySelector(`[data-error-for="${name}"]`), "form.error.choice");
      isValid = false;
    }
  });

  const missingCheckbox = Array.from(step.querySelectorAll("input[type='checkbox'][required]")).find(
    (checkbox) => !checkbox.checked,
  );
  if (missingCheckbox) {
    missingCheckbox.setAttribute("aria-invalid", "true");
    setElementMessage(
      step.querySelector(`[data-error-for="${missingCheckbox.name}"]`) || step.querySelector('[data-error-for="consent"]'),
      "form.error.consent",
    );
    isValid = false;
  }

  if (!isValid) {
    const firstInvalid = step.querySelector("[aria-invalid='true'], input:invalid");
    if (firstInvalid) firstInvalid.focus();
  }

  return isValid;
}

function initializeBuilderPage() {
  const form = document.querySelector("#story-builder-form");
  if (!form) return;

  trackStoryBuilderStart();

  const steps = Array.from(form.querySelectorAll(".wizard-step"));
  const backButton = form.querySelector(".wizard-back");
  const nextButton = form.querySelector(".wizard-next");
  const generateButton = form.querySelector(".wizard-generate");
  const progressFill = document.querySelector("#progress-fill");
  const progressLabels = Array.from(document.querySelectorAll(".progress-labels span"));
  const formStatus = document.querySelector("#form-status");
  const marketingConsent = form.elements.marketingConsent;
  const emailField = form.elements.email;
  let currentStep = 0;

  fillFormFromProfile(form, readStoredProfile());
  syncLanguageFormFields();

  function syncMarketingEmailRequirement() {
    if (!emailField || !marketingConsent) return;
    emailField.required = Boolean(marketingConsent.checked);
    emailField.closest(".field")?.classList.toggle("is-required", emailField.required);
  }

  function showStep(index) {
    currentStep = Math.min(Math.max(index, 0), steps.length - 1);
    steps.forEach((step, stepIndex) => {
      step.classList.toggle("is-active", stepIndex === currentStep);
    });
    progressLabels.forEach((label, labelIndex) => {
      label.classList.toggle("is-current", labelIndex === currentStep);
      label.classList.toggle("is-complete", labelIndex < currentStep);
    });
    progressFill.style.width = `${((currentStep + 1) / steps.length) * 100}%`;
    backButton.hidden = currentStep === 0;
    nextButton.hidden = currentStep === steps.length - 1;
    generateButton.hidden = currentStep !== steps.length - 1;
    clearElementMessage(formStatus);

    const activeStep = steps[currentStep];
    activeStep.classList.remove("step-enter");
    requestAnimationFrame(() => activeStep.classList.add("step-enter"));
    window.scrollTo({ top: Math.max(0, form.offsetTop - 100), behavior: "smooth" });
  }

  nextButton.addEventListener("click", () => {
    if (validateStep(steps[currentStep])) showStep(currentStep + 1);
  });

  backButton.addEventListener("click", () => showStep(currentStep - 1));

  form.addEventListener("change", (event) => {
    const target = event.target;
    if (target === marketingConsent) syncMarketingEmailRequirement();
    if (target.matches("input, select")) {
      target.removeAttribute("aria-invalid");
      const step = target.closest(".wizard-step");
      if (step) clearStepErrors(step);
    }
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    syncMarketingEmailRequirement();
    if (!validateStep(steps[currentStep])) return;

    const profile = getFormProfile(form);
    writeStoredProfile(profile);
    trackStoryGenerated();

    generateButton.disabled = true;
    generateButton.textContent = translate("builder.status.creating");

    if (marketingConsent?.checked && emailField?.value) {
      const payload = buildMinimalWaitlistPayload({
        email: emailField.value,
        source: "story-builder",
        adultConfirmation: true,
        marketingConsent: true,
      });

      try {
        await postMinimalWaitlistToFormspree(form.dataset.formspreeEndpoint, payload, {
          timeoutMs: STORY_BUILDER_FORMSPREE_TIMEOUT_MS,
        });
        trackWaitlistSubmission("story-builder");
      } catch (error) {
        console.warn("MoonTale waitlist submission failed.", error);
      }
    }

    setElementMessage(formStatus, "builder.status.ready");
    window.setTimeout(() => {
      window.location.href = STORY_PAGE_URL;
    }, 300);
  });

  syncMarketingEmailRequirement();
  showStep(0);
}

document.addEventListener("DOMContentLoaded", () => {
  initializeSiteNavigation();
  initializeCookieConsent();
  initializeLanguageSelectors();
  updateTranslatedContent();
  initializeRevealElements();
  initializeBuilderPage();
});
