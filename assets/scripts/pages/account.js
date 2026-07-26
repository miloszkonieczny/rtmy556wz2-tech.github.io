import { initializeCookieConsent } from "../core/cookie-consent.js";
import { initializeSiteNavigation } from "../core/navigation.js";
import {
  ProfileSessionError,
  ageGroupLabel,
  childProfilePayload,
  createChildProfileService,
  languageLabel,
  profileFormValues,
} from "../services/child-profiles.js";
import {
  createAuthCallbackTracker,
  getAccountRedirectUrl,
  getAuthCallbackContext,
  getCleanAuthCallbackUrl,
  getSupabaseClient,
  updateRecoveryPassword,
  verifyRecoveryToken,
} from "../supabase-config.js?v=20260726-token-recovery";

const elements = {
  pageStatus: document.querySelector("#account-status"),
  signedOut: document.querySelector("#signed-out"),
  signedIn: document.querySelector("#signed-in"),
  recovery: document.querySelector("#password-recovery"),
  userEmail: document.querySelector("#account-email"),
  logout: document.querySelector("#logout-button"),
  profileList: document.querySelector("#profile-list"),
  profileEmpty: document.querySelector("#profile-empty"),
  profileStatus: document.querySelector("#profile-status"),
  profileForm: document.querySelector("#profile-form"),
  profileFormHeading: document.querySelector("#profile-form-heading"),
  profileSubmit: document.querySelector("#profile-submit"),
  addProfile: document.querySelector("#add-profile-button"),
  cancelProfile: document.querySelector("#cancel-profile-button"),
};

const state = {
  client: null,
  profileService: null,
  user: null,
  profiles: [],
  editingProfileId: null,
  profileRequestId: 0,
  recoveryMode: false,
  intentionalSignOut: false,
  authCallbackPending: false,
  authCallbackContext: null,
  authCallbackTracker: null,
  authInitializationComplete: false,
  invalidCallbackActive: false,
  initialSessionHandled: false,
};

function setMessage(element, message = "", tone = "neutral") {
  if (!element) return;
  element.textContent = message;
  element.dataset.tone = tone;
  element.setAttribute("aria-live", tone === "error" ? "assertive" : "polite");
}

function showAccountView(view) {
  elements.signedOut.hidden = view !== "signed-out";
  elements.signedIn.hidden = view !== "signed-in";
  elements.recovery.hidden = view !== "recovery";
}

function formValues(form) {
  return Object.fromEntries(new FormData(form).entries());
}

function setFormBusy(form, busy) {
  form.setAttribute("aria-busy", String(busy));
  form.querySelectorAll("button, input, select").forEach((control) => {
    control.disabled = busy;
  });

  const submitButton = form.querySelector('button[type="submit"]');
  if (!submitButton) return;

  if (busy) {
    submitButton.dataset.idleLabel = submitButton.textContent;
    submitButton.textContent =
      submitButton.dataset.loadingLabel || submitButton.textContent;
  } else if (submitButton.dataset.idleLabel) {
    submitButton.textContent = submitButton.dataset.idleLabel;
    delete submitButton.dataset.idleLabel;
  }
}

function disableAccountControls() {
  document
    .querySelectorAll(
      "#signed-out button, #signed-out input, #password-recovery button, #password-recovery input",
    )
    .forEach((control) => {
      control.disabled = true;
    });
}

function enableAccountControls() {
  document.querySelectorAll("[data-account-control]").forEach((control) => {
    control.disabled = false;
  });
}

function cleanAuthUrl() {
  const cleanUrl = getCleanAuthCallbackUrl(window.location);
  const currentUrl =
    `${window.location.pathname}${window.location.search}` +
    window.location.hash;
  if (cleanUrl === currentUrl) return;

  window.history.replaceState({}, document.title, cleanUrl);
}

function authErrorMessage(error, context) {
  const message = String(error?.message || "").toLowerCase();
  const code = String(error?.code || "").toLowerCase();

  if (
    code === "invalid_credentials" ||
    message.includes("invalid login credentials")
  ) {
    return "The email or password is incorrect.";
  }
  if (message.includes("email not confirmed")) {
    return "Confirm your email address before signing in. Check your inbox for the confirmation message.";
  }
  if (
    message.includes("password should be") ||
    message.includes("weak password")
  ) {
    return "Choose a stronger password with at least 10 characters.";
  }
  if (message.includes("user already registered")) {
    return "An account already exists for this email. Sign in or request a password reset.";
  }
  if (message.includes("rate limit") || error?.status === 429) {
    return "Too many attempts were made. Wait a little and try again.";
  }
  if (
    message.includes("expired") ||
    message.includes("invalid token") ||
    code.includes("refresh_token")
  ) {
    return "This account link or session has expired. Request a new link and try again.";
  }

  const fallbacks = {
    login: "Sign-in could not be completed. Check your details and try again.",
    signup: "Account creation could not be completed. Try again.",
    reset: "The reset request could not be completed. Try again later.",
    password:
      "The password could not be updated. Request a new reset link and try again.",
    logout: "Sign-out could not be completed. Try again.",
  };
  return fallbacks[context] || "The account request could not be completed.";
}

function profileErrorMessage(error, action) {
  if (error instanceof ProfileSessionError) {
    return "Your session has expired. Sign in again to continue.";
  }

  const code = String(error?.code || "");
  if (code === "23505") {
    return "That profile already exists.";
  }
  if (code === "23514" || code === "22001") {
    return "One or more profile details are not accepted. Review the form and try again.";
  }
  if (code === "42501") {
    return "MoonTale could not access this profile. Sign in again and retry.";
  }
  if (code.startsWith("PGRST")) {
    return "The profile database is temporarily unavailable. Try again shortly.";
  }

  const labels = {
    load: "Profiles could not be loaded.",
    create: "The profile could not be created.",
    update: "The profile could not be updated.",
    delete: "The profile could not be deleted.",
  };
  return `${labels[action] || "The profile request failed"} Try again.`;
}

function createActionButton(label, action, profile, className) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = className;
  button.dataset.action = action;
  button.dataset.profileId = profile.id;
  button.textContent = label;
  button.setAttribute("aria-label", `${label} ${profile.nickname}`);
  return button;
}

function createProfileCard(profile) {
  const item = document.createElement("li");
  item.className = "account-profile-card";

  const heading = document.createElement("div");
  heading.className = "account-profile-heading";

  const avatar = document.createElement("span");
  avatar.className = "account-profile-avatar";
  avatar.setAttribute("aria-hidden", "true");
  avatar.textContent = String(profile.nickname || "").trim().charAt(0) || "✦";

  const titleGroup = document.createElement("div");
  const title = document.createElement("h3");
  title.className = "serif";
  title.textContent = profile.nickname;
  const age = document.createElement("p");
  age.className = "account-profile-meta";
  age.textContent = ageGroupLabel(profile.age_group);
  titleGroup.append(title, age);
  heading.append(avatar, titleGroup);

  const languages = document.createElement("p");
  languages.className = "account-profile-meta";
  languages.textContent = `Home language: ${languageLabel(
    profile.native_language,
  )} · Learning: ${languageLabel(profile.target_language)}`;

  const interests = document.createElement("ul");
  interests.className = "account-interest-list";
  interests.setAttribute("aria-label", `${profile.nickname}'s interests`);
  const safeInterests = Array.isArray(profile.interests)
    ? profile.interests
    : [];

  if (safeInterests.length) {
    safeInterests.forEach((interest) => {
      const interestItem = document.createElement("li");
      interestItem.textContent = interest;
      interests.appendChild(interestItem);
    });
  } else {
    const interestItem = document.createElement("li");
    interestItem.className = "is-placeholder";
    interestItem.textContent = "No interests added";
    interests.appendChild(interestItem);
  }

  const actions = document.createElement("div");
  actions.className = "account-profile-actions";
  actions.append(
    createActionButton(
      "Edit",
      "edit",
      profile,
      "button button-secondary account-small-button",
    ),
    createActionButton(
      "Delete",
      "delete",
      profile,
      "button account-delete-button account-small-button",
    ),
  );

  item.append(heading, languages, interests, actions);
  return item;
}

function renderProfiles() {
  elements.profileList.replaceChildren();
  elements.profileEmpty.hidden = state.profiles.length !== 0;
  state.profiles.forEach((profile) => {
    elements.profileList.appendChild(createProfileCard(profile));
  });
}

function closeProfileForm() {
  state.editingProfileId = null;
  elements.profileForm.reset();
  elements.profileForm.hidden = true;
  elements.addProfile.focus({ preventScroll: true });
}

function openProfileForm(profile = null) {
  elements.profileForm.reset();
  state.editingProfileId = profile?.id || null;
  elements.profileFormHeading.textContent = profile
    ? "Edit child profile"
    : "Create child profile";
  elements.profileSubmit.textContent = profile ? "Save changes" : "Save profile";

  if (profile) {
    const values = profileFormValues(profile);
    Object.entries(values).forEach(([name, value]) => {
      const control = elements.profileForm.elements.namedItem(name);
      if (control) control.value = value;
    });
  }

  elements.profileForm.hidden = false;
  elements.profileForm
    .elements.namedItem("nickname")
    ?.focus({ preventScroll: true });
  elements.profileForm.scrollIntoView({
    block: "nearest",
    behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
      ? "auto"
      : "smooth",
  });
}

function resetSignedInState() {
  state.profileRequestId += 1;
  state.user = null;
  state.profiles = [];
  state.editingProfileId = null;
  elements.profileForm.reset();
  elements.profileForm.hidden = true;
  renderProfiles();
  elements.userEmail.textContent = "";
  setMessage(elements.profileStatus);
}

async function expireSession() {
  resetSignedInState();
  showAccountView("signed-out");
  setMessage(
    elements.pageStatus,
    "Your session has expired. Sign in again to continue.",
    "error",
  );
  await state.client.auth.signOut({ scope: "local" }).catch(() => {});
}

async function showInvalidAuthCallback(session, { recovery = false } = {}) {
  state.invalidCallbackActive = true;
  state.authCallbackPending = false;
  state.recoveryMode = false;
  resetSignedInState();
  showAccountView("signed-out");
  setMessage(
    elements.pageStatus,
    recovery
      ? "This password-reset link is invalid, expired, or has already been used. Request a new reset link and try again."
      : "This confirmation link is invalid or has expired. Request a new link and try again.",
    "error",
  );

  if (session?.user) {
    await state.client.auth.signOut({ scope: "local" }).catch(() => {});
  }
  cleanAuthUrl();
}

async function loadProfiles(user) {
  const requestId = ++state.profileRequestId;
  elements.addProfile.disabled = true;
  elements.profileList.setAttribute("aria-busy", "true");
  setMessage(elements.profileStatus, "Loading profiles…");

  try {
    const profiles = await state.profileService.list();
    if (requestId !== state.profileRequestId || state.user?.id !== user.id) {
      return;
    }

    state.profiles = profiles;
    renderProfiles();
    setMessage(
      elements.profileStatus,
      profiles.length
        ? `${profiles.length} saved profile${profiles.length === 1 ? "" : "s"}.`
        : "",
      "success",
    );
  } catch (error) {
    if (requestId !== state.profileRequestId) return;
    console.error("MoonTale profile loading failed", error);
    if (error instanceof ProfileSessionError) {
      await expireSession();
      return;
    }

    state.profiles = [];
    renderProfiles();
    setMessage(
      elements.profileStatus,
      profileErrorMessage(error, "load"),
      "error",
    );
  } finally {
    if (requestId === state.profileRequestId && state.user?.id === user.id) {
      elements.addProfile.disabled = false;
      elements.profileList.setAttribute("aria-busy", "false");
    }
  }
}

async function applyAuthState(event, session) {
  if (event === "PASSWORD_RECOVERY") {
    if (!session?.user) {
      await showInvalidAuthCallback(null, { recovery: true });
      return;
    }
    state.recoveryMode = true;
    state.authCallbackPending = false;
    state.user = session.user;
    showAccountView("recovery");
    setMessage(
      elements.pageStatus,
      "Choose a new password to finish account recovery.",
    );
    return;
  }

  if (
    state.recoveryMode &&
    (session?.user || event === "INITIAL_SESSION")
  ) {
    if (session?.user) state.user = session.user;
    showAccountView("recovery");
    setMessage(
      elements.pageStatus,
      "Choose a new password to finish account recovery.",
    );
    return;
  }

  if (session?.user) {
    const userChanged = state.user?.id !== session.user.id;
    state.user = session.user;
    elements.userEmail.textContent = session.user.email || "your account";
    showAccountView("signed-in");

    if (event === "SIGNED_IN" && state.authCallbackPending) {
      setMessage(
        elements.pageStatus,
        "Your email is confirmed and your account is ready.",
        "success",
      );
      state.authCallbackPending = false;
    } else if (event === "SIGNED_IN") {
      setMessage(elements.pageStatus, "Signed in successfully.", "success");
    } else if (event === "INITIAL_SESSION") {
      setMessage(elements.pageStatus, "Your account is ready.", "success");
    }

    if (userChanged) {
      await loadProfiles(session.user);
    }
    return;
  }

  const hadSignedInUser = Boolean(state.user);
  const signedOutIntentionally = state.intentionalSignOut;
  if (event === "SIGNED_OUT" && !hadSignedInUser && !signedOutIntentionally) {
    return;
  }

  state.intentionalSignOut = false;
  resetSignedInState();
  state.recoveryMode = false;
  showAccountView("signed-out");

  if (event === "SIGNED_OUT" && signedOutIntentionally) {
    setMessage(elements.pageStatus, "You have been signed out.", "success");
  } else if (event === "SIGNED_OUT") {
    setMessage(
      elements.pageStatus,
      "Your session has expired. Sign in again to continue.",
      "error",
    );
  } else {
    setMessage(
      elements.pageStatus,
      "Sign in or create a parent account to manage child profiles.",
    );
  }
}

function wireAuthenticationForms() {
  document
    .querySelector("#login-form")
    .addEventListener("submit", async (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      const { email, password } = formValues(form);
      setFormBusy(form, true);
      setMessage(elements.pageStatus, "Signing in…");

      try {
        const result = await state.client.auth.signInWithPassword({
          email,
          password,
        });
        if (result.error) {
          setMessage(
            elements.pageStatus,
            authErrorMessage(result.error, "login"),
            "error",
          );
        }
      } catch (error) {
        console.error("MoonTale sign-in failed", error);
        setMessage(
          elements.pageStatus,
          "Sign-in could not be completed. Check your connection and try again.",
          "error",
        );
      } finally {
        setFormBusy(form, false);
      }
    });

  document
    .querySelector("#signup-form")
    .addEventListener("submit", async (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      const { email, password, password_confirmation: passwordConfirmation } =
        formValues(form);

      if (password !== passwordConfirmation) {
        setMessage(elements.pageStatus, "The passwords do not match.", "error");
        form.elements.namedItem("password_confirmation")?.focus();
        return;
      }

      setFormBusy(form, true);
      setMessage(elements.pageStatus, "Creating your account…");

      try {
        const result = await state.client.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: getAccountRedirectUrl(),
          },
        });
        if (result.error) {
          setMessage(
            elements.pageStatus,
            authErrorMessage(result.error, "signup"),
            "error",
          );
          return;
        }

        form.reset();
        if (result.data.session) {
          setMessage(elements.pageStatus, "Account created.", "success");
        } else {
          setMessage(
            elements.pageStatus,
            "Check your inbox and select the MoonTale confirmation link. After confirmation, return here to sign in.",
            "success",
          );
        }
      } catch (error) {
        console.error("MoonTale registration failed", error);
        setMessage(
          elements.pageStatus,
          "Account creation could not be completed. Check your connection and try again.",
          "error",
        );
      } finally {
        setFormBusy(form, false);
      }
    });

  document
    .querySelector("#forgot-password-form")
    .addEventListener("submit", async (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      const { email } = formValues(form);
      setFormBusy(form, true);
      setMessage(elements.pageStatus, "Requesting a reset link…");

      try {
        const result = await state.client.auth.resetPasswordForEmail(email, {
          redirectTo: getAccountRedirectUrl(),
        });
        if (result.error) {
          setMessage(
            elements.pageStatus,
            authErrorMessage(result.error, "reset"),
            "error",
          );
          return;
        }

        form.reset();
        setMessage(
          elements.pageStatus,
          "If an account exists for that email, a password reset link has been sent.",
          "success",
        );
      } catch (error) {
        console.error("MoonTale password reset request failed", error);
        setMessage(
          elements.pageStatus,
          "The reset request could not be completed. Check your connection and try again.",
          "error",
        );
      } finally {
        setFormBusy(form, false);
      }
    });

  document
    .querySelector("#new-password-form")
    .addEventListener("submit", async (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      const { password, password_confirmation: passwordConfirmation } =
        formValues(form);

      if (password !== passwordConfirmation) {
        setMessage(elements.pageStatus, "The passwords do not match.", "error");
        form.elements.namedItem("password_confirmation")?.focus();
        return;
      }

      setFormBusy(form, true);
      setMessage(elements.pageStatus, "Updating your password…");

      try {
        const result = await updateRecoveryPassword(state.client, password);
        if (result.error) {
          setMessage(
            elements.pageStatus,
            authErrorMessage(result.error, "password"),
            "error",
          );
          return;
        }

        form.reset();
        state.recoveryMode = false;
        cleanAuthUrl();
        const sessionResult = await state.client.auth.getSession();
        if (sessionResult.error || !sessionResult.data.session) {
          await applyAuthState("SIGNED_OUT", null);
          setMessage(
            elements.pageStatus,
            "Password updated. Sign in with your new password.",
            "success",
          );
          return;
        }

        state.user = null;
        await applyAuthState("USER_UPDATED", sessionResult.data.session);
        setMessage(
          elements.pageStatus,
          "Your password has been updated.",
          "success",
        );
      } catch (error) {
        console.error("MoonTale password update failed", error);
        setMessage(
          elements.pageStatus,
          "The password could not be updated. Request a new reset link and try again.",
          "error",
        );
      } finally {
        setFormBusy(form, false);
      }
    });

  elements.logout.addEventListener("click", async () => {
    elements.logout.disabled = true;
    elements.logout.setAttribute("aria-busy", "true");
    state.intentionalSignOut = true;
    setMessage(elements.pageStatus, "Signing out…");

    try {
      const result = await state.client.auth.signOut({ scope: "local" });
      if (result.error) {
        state.intentionalSignOut = false;
        setMessage(
          elements.pageStatus,
          authErrorMessage(result.error, "logout"),
          "error",
        );
        return;
      }
      await applyAuthState("SIGNED_OUT", null);
    } catch (error) {
      state.intentionalSignOut = false;
      console.error("MoonTale sign-out failed", error);
      setMessage(
        elements.pageStatus,
        "Sign-out could not be completed. Check your connection and try again.",
        "error",
      );
    } finally {
      elements.logout.disabled = false;
      elements.logout.setAttribute("aria-busy", "false");
    }
  });
}

function wireProfileControls() {
  elements.addProfile.addEventListener("click", () => openProfileForm());
  elements.cancelProfile.addEventListener("click", closeProfileForm);

  elements.profileList.addEventListener("click", async (event) => {
    if (!(event.target instanceof Element)) return;
    const control = event.target.closest("button[data-action]");
    if (!control || !state.user) return;

    const profile = state.profiles.find(
      (item) => item.id === control.dataset.profileId,
    );
    if (!profile) return;

    if (control.dataset.action === "edit") {
      openProfileForm(profile);
      return;
    }
    if (control.dataset.action !== "delete") return;

    const confirmed = window.confirm(
      `Delete ${profile.nickname}'s child profile? This cannot be undone.`,
    );
    if (!confirmed) return;

    control.disabled = true;
    control.closest(".account-profile-card")?.setAttribute("aria-busy", "true");
    const parentId = state.user.id;
    setMessage(
      elements.profileStatus,
      `Deleting ${profile.nickname}'s profile…`,
    );

    try {
      await state.profileService.remove(profile.id);
      if (state.user?.id !== parentId) return;
      state.profiles = state.profiles.filter((item) => item.id !== profile.id);
      if (state.editingProfileId === profile.id) {
        state.editingProfileId = null;
        elements.profileForm.reset();
        elements.profileForm.hidden = true;
      }
      renderProfiles();
      setMessage(elements.profileStatus, "Profile deleted.", "success");
    } catch (error) {
      if (state.user?.id !== parentId) return;
      console.error("MoonTale profile deletion failed", error);
      if (error instanceof ProfileSessionError) {
        await expireSession();
        return;
      }
      setMessage(
        elements.profileStatus,
        profileErrorMessage(error, "delete"),
        "error",
      );
      control.disabled = false;
      control
        .closest(".account-profile-card")
        ?.setAttribute("aria-busy", "false");
    }
  });

  elements.profileForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!state.user) {
      await expireSession();
      return;
    }

    const form = event.currentTarget;
    let payload;
    try {
      payload = childProfilePayload(formValues(form));
    } catch (error) {
      setMessage(elements.profileStatus, error.message, "error");
      return;
    }

    const editingProfileId = state.editingProfileId;
    const parentId = state.user.id;
    setFormBusy(form, true);
    setMessage(
      elements.profileStatus,
      editingProfileId ? "Saving profile changes…" : "Creating profile…",
    );

    try {
      const savedProfile = editingProfileId
        ? await state.profileService.update(editingProfileId, payload)
        : await state.profileService.create(payload);

      if (state.user?.id !== parentId) return;
      if (editingProfileId) {
        state.profiles = state.profiles.map((profile) =>
          profile.id === savedProfile.id ? savedProfile : profile,
        );
      } else {
        state.profiles = [...state.profiles, savedProfile];
      }

      state.editingProfileId = null;
      form.reset();
      form.hidden = true;
      renderProfiles();
      setMessage(
        elements.profileStatus,
        editingProfileId
          ? "Profile updated."
          : `${savedProfile.nickname}'s profile was created.`,
        "success",
      );
    } catch (error) {
      if (state.user?.id !== parentId) return;
      console.error("MoonTale profile save failed", error);
      if (error instanceof ProfileSessionError) {
        await expireSession();
        return;
      }
      setMessage(
        elements.profileStatus,
        profileErrorMessage(error, editingProfileId ? "update" : "create"),
        "error",
      );
    } finally {
      setFormBusy(form, false);
    }
  });
}

function registerAuthStateListener() {
  state.client.auth.onAuthStateChange((event, session) => {
    state.authCallbackTracker.observe(event, session);
    if (event === "PASSWORD_RECOVERY" && session?.user) {
      state.recoveryMode = true;
    }

    if (!state.authInitializationComplete) return;
    if (event === "INITIAL_SESSION" && state.initialSessionHandled) return;
    if (
      state.invalidCallbackActive &&
      (event === "INITIAL_SESSION" || event === "SIGNED_OUT")
    ) {
      return;
    }
    if (event === "SIGNED_IN") state.invalidCallbackActive = false;

    window.setTimeout(() => {
      applyAuthState(event, session)
        .then(() => {
          if (event === "PASSWORD_RECOVERY" && session?.user) cleanAuthUrl();
        })
        .catch((error) => {
          console.error("MoonTale auth state update failed", error);
          setMessage(
            elements.pageStatus,
            "The account state could not be refreshed. Reload the page and try again.",
            "error",
          );
        });
    }, 0);
  });
}

async function waitForInitialAuthEvent() {
  let timeoutId;
  await Promise.race([
    state.authCallbackTracker.waitForInitialSession(),
    new Promise((resolve) => {
      timeoutId = window.setTimeout(resolve, 2500);
    }),
  ]);
  if (timeoutId) window.clearTimeout(timeoutId);
}

async function verifyRecoveryCallback() {
  if (!state.authCallbackContext.isRecoveryTokenHash) return null;

  setMessage(elements.pageStatus, "Verifying your password-reset link…");

  try {
    const result = await verifyRecoveryToken(
      state.client,
      state.authCallbackContext.tokenHash,
    );
    if (!result.error && result.data?.session?.user) {
      state.authCallbackTracker.observe("PASSWORD_RECOVERY", result.data.session);
    }
    return result;
  } catch (error) {
    console.error("MoonTale password recovery verification failed", error);
    return {
      data: { session: null, user: null },
      error,
    };
  }
}

async function resolveInitialAuthState(sessionResult, recoveryResult) {
  if (state.authCallbackContext.isRecoveryTokenHash) {
    const recoverySession = recoveryResult?.data?.session || null;
    if (recoveryResult?.error || !recoverySession?.user) {
      await showInvalidAuthCallback(sessionResult.data?.session || null, {
        recovery: true,
      });
    } else {
      state.recoveryMode = true;
      state.authCallbackPending = false;
      await applyAuthState("PASSWORD_RECOVERY", recoverySession);
      cleanAuthUrl();
    }

    state.initialSessionHandled = true;
    state.authInitializationComplete = true;
    return;
  }

  const resolution = state.authCallbackTracker.resolve(sessionResult);

  if (resolution.status === "recovery" && resolution.session?.user) {
    state.recoveryMode = true;
    await applyAuthState("PASSWORD_RECOVERY", resolution.session);
    cleanAuthUrl();
  } else if (
    resolution.status === "confirmation" &&
    resolution.session?.user
  ) {
    await applyAuthState("SIGNED_IN", resolution.session);
    cleanAuthUrl();
  } else if (resolution.status === "invalid") {
    await showInvalidAuthCallback(resolution.session, {
      recovery: state.authCallbackContext.recoveryHint,
    });
  } else {
    await applyAuthState("INITIAL_SESSION", resolution.session);
    if (resolution.error) {
      setMessage(
        elements.pageStatus,
        "Your saved session could not be restored. Sign in again to continue.",
        "error",
      );
    }
  }

  state.initialSessionHandled = true;
  state.authInitializationComplete = true;
}

async function initializeAccountPage() {
  initializeSiteNavigation();
  initializeCookieConsent();
  showAccountView("signed-out");

  try {
    const callbackContext = getAuthCallbackContext();
    state.authCallbackContext = callbackContext;
    state.authCallbackTracker = createAuthCallbackTracker(callbackContext);
    state.authCallbackPending = callbackContext.hasCallback;
    state.recoveryMode = callbackContext.recoveryHint;
    state.client = getSupabaseClient();
    registerAuthStateListener();
    state.profileService = createChildProfileService(state.client);
  } catch (error) {
    console.error("MoonTale Supabase initialization failed", error);
    disableAccountControls();
    setMessage(
      elements.pageStatus,
      "Accounts are temporarily unavailable. The anonymous story builder still works.",
      "error",
    );
    return;
  }

  wireAuthenticationForms();
  wireProfileControls();

  const recoveryResult = await verifyRecoveryCallback();
  const sessionResult = await state.client.auth.getSession();
  await waitForInitialAuthEvent();
  await resolveInitialAuthState(sessionResult, recoveryResult);
  enableAccountControls();
}

document.addEventListener("DOMContentLoaded", () => {
  initializeAccountPage().catch((error) => {
    console.error("MoonTale account page failed", error);
    showAccountView("signed-out");
    disableAccountControls();
    setMessage(
      elements.pageStatus,
      "Accounts are temporarily unavailable. The anonymous story builder still works.",
      "error",
    );
  });
});
