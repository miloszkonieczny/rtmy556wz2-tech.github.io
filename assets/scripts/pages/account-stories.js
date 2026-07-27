import { getSupabaseClient } from "../supabase-config.js?v=20260726-token-recovery";
import {
  createStoryService,
  StorySessionError,
} from "../services/stories.js";

const LANGUAGE_LABELS = Object.freeze({
  en: "English",
  pl: "Polish",
  es: "Spanish",
  fr: "French",
  de: "German",
});

const elements = {
  signedIn: document.querySelector("#signed-in"),
};

const state = {
  client: null,
  storyService: null,
  userId: null,
  profiles: [],
  stories: [],
  requestId: 0,
};

function formatDate(value) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Unknown date";
  }

  return new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function languageLabel(value) {
  const normalized = String(value || "").trim();
  return LANGUAGE_LABELS[normalized] || normalized || "Not specified";
}

function createHistorySection() {
  const section = document.createElement("section");
  section.className = "account-panel account-stories-panel";
  section.id = "account-stories-panel";
  section.setAttribute("aria-labelledby", "account-stories-title");
  section.innerHTML = `
    <div class="account-section-heading">
      <div>
        <p class="eyebrow">Saved stories</p>
        <h2 class="serif" id="account-stories-title">Story history</h2>
        <p class="account-panel-copy">
          Stories created while signed in are kept under the selected child profile.
        </p>
      </div>
      <button class="button button-secondary" id="refresh-stories-button" type="button">
        Refresh stories
      </button>
    </div>
    <p class="account-inline-status" id="story-history-status" role="status" aria-live="polite"></p>
    <div class="account-story-empty" id="story-history-empty" hidden>
      <span aria-hidden="true">☾</span>
      <h3 class="serif">No saved stories yet</h3>
      <p>Create a story using a saved child profile and it will appear here.</p>
    </div>
    <div class="account-story-groups" id="story-history-groups" aria-busy="false"></div>
  `;

  elements.signedIn?.appendChild(section);
  return section;
}

function createStoryDialog() {
  const dialog = document.createElement("dialog");
  dialog.className = "account-story-dialog";
  dialog.id = "account-story-dialog";
  dialog.innerHTML = `
    <article>
      <div class="account-story-dialog-heading">
        <div>
          <p class="eyebrow">Saved MoonTale</p>
          <h2 class="serif" id="account-story-dialog-title"></h2>
          <p class="account-profile-meta" id="account-story-dialog-meta"></p>
        </div>
        <button class="account-story-dialog-close" type="button" aria-label="Close story">×</button>
      </div>
      <div class="account-story-dialog-content" id="account-story-dialog-content"></div>
    </article>
  `;

  document.body.appendChild(dialog);
  dialog
    .querySelector(".account-story-dialog-close")
    ?.addEventListener("click", () => dialog.close());
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) dialog.close();
  });
  return dialog;
}

const section = createHistorySection();
const groupsElement = section.querySelector("#story-history-groups");
const emptyElement = section.querySelector("#story-history-empty");
const statusElement = section.querySelector("#story-history-status");
const refreshButton = section.querySelector("#refresh-stories-button");
const dialog = createStoryDialog();

function setStatus(message = "", tone = "neutral") {
  statusElement.textContent = message;
  statusElement.dataset.tone = tone;
}

function clearHistory() {
  state.profiles = [];
  state.stories = [];
  groupsElement.replaceChildren();
  emptyElement.hidden = true;
  setStatus();
}

function openStory(story, profile) {
  dialog.querySelector("#account-story-dialog-title").textContent = story.title;
  dialog.querySelector("#account-story-dialog-meta").textContent =
    `${profile?.nickname || "Child profile"} · ${formatDate(story.created_at)} · ${languageLabel(story.target_language)}`;

  const content = dialog.querySelector("#account-story-dialog-content");
  content.replaceChildren();

  String(story.story_content || "")
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
    .forEach((paragraph) => {
      const element = document.createElement("p");
      element.textContent = paragraph;
      content.appendChild(element);
    });

  dialog.showModal();
}

function createStoryCard(story, profile) {
  const article = document.createElement("article");
  article.className = "account-story-card";
  article.dataset.storyId = story.id;

  const title = document.createElement("h4");
  title.className = "serif";
  title.textContent = story.title;

  const meta = document.createElement("p");
  meta.className = "account-profile-meta";
  meta.textContent = `${formatDate(story.created_at)} · ${languageLabel(story.target_language)}`;

  const topic = document.createElement("p");
  topic.className = "account-story-topic";
  topic.textContent = story.topic ? `Topic: ${story.topic}` : "No topic saved";

  const actions = document.createElement("div");
  actions.className = "account-profile-actions";

  const openButton = document.createElement("button");
  openButton.type = "button";
  openButton.className = "button button-secondary account-small-button";
  openButton.textContent = "Open story";
  openButton.addEventListener("click", () => openStory(story, profile));

  const deleteButton = document.createElement("button");
  deleteButton.type = "button";
  deleteButton.className = "button account-delete-button account-small-button";
  deleteButton.textContent = "Delete story";
  deleteButton.addEventListener("click", async () => {
    const confirmed = window.confirm(
      `Delete “${story.title}”? This cannot be undone.`,
    );

    if (!confirmed) return;

    deleteButton.disabled = true;
    article.setAttribute("aria-busy", "true");
    setStatus("Deleting story…");

    try {
      await state.storyService.remove(story.id);
      state.stories = state.stories.filter((item) => item.id !== story.id);
      renderHistory();
      setStatus("Story deleted.", "success");
    } catch (error) {
      console.error("MoonTale story deletion failed", error);
      setStatus(
        error instanceof StorySessionError
          ? "Your session has expired. Sign in again."
          : "The story could not be deleted. Try again.",
        "error",
      );
      deleteButton.disabled = false;
      article.setAttribute("aria-busy", "false");
    }
  });

  actions.append(openButton, deleteButton);
  article.append(title, meta, topic, actions);
  return article;
}

function renderHistory() {
  groupsElement.replaceChildren();
  emptyElement.hidden = state.stories.length !== 0;

  const profilesById = new Map(
    state.profiles.map((profile) => [profile.id, profile]),
  );

  const storiesByChild = new Map();
  state.stories.forEach((story) => {
    const stories = storiesByChild.get(story.child_id) || [];
    stories.push(story);
    storiesByChild.set(story.child_id, stories);
  });

  state.profiles.forEach((profile) => {
    const stories = storiesByChild.get(profile.id) || [];
    if (!stories.length) return;

    const group = document.createElement("section");
    group.className = "account-story-group";

    const heading = document.createElement("div");
    heading.className = "account-story-group-heading";

    const title = document.createElement("h3");
    title.className = "serif";
    title.textContent = profile.nickname;

    const count = document.createElement("p");
    count.className = "account-profile-meta";
    count.textContent = `${stories.length} saved stor${stories.length === 1 ? "y" : "ies"}`;

    heading.append(title, count);

    const list = document.createElement("div");
    list.className = "account-story-list";
    stories.forEach((story) => {
      list.appendChild(createStoryCard(story, profilesById.get(story.child_id)));
    });

    group.append(heading, list);
    groupsElement.appendChild(group);
  });
}

async function loadHistory(userId) {
  const requestId = ++state.requestId;
  groupsElement.setAttribute("aria-busy", "true");
  refreshButton.disabled = true;
  setStatus("Loading saved stories…");

  try {
    const [profilesResult, stories] = await Promise.all([
      state.client
        .from("child_profiles")
        .select("id,nickname")
        .order("created_at", { ascending: true }),
      state.storyService.list(),
    ]);

    if (profilesResult.error) throw profilesResult.error;
    if (requestId !== state.requestId || state.userId !== userId) return;

    state.profiles = Array.isArray(profilesResult.data)
      ? profilesResult.data
      : [];
    state.stories = stories;
    renderHistory();
    setStatus(
      stories.length
        ? `${stories.length} saved stor${stories.length === 1 ? "y" : "ies"}.`
        : "",
      "success",
    );
  } catch (error) {
    if (requestId !== state.requestId) return;
    console.error("MoonTale story history loading failed", error);
    clearHistory();
    setStatus(
      error instanceof StorySessionError
        ? "Your session has expired. Sign in again."
        : "Saved stories could not be loaded. Try again.",
      "error",
    );
  } finally {
    if (requestId === state.requestId && state.userId === userId) {
      groupsElement.setAttribute("aria-busy", "false");
      refreshButton.disabled = false;
    }
  }
}

async function applySession(session) {
  const userId = session?.user?.id || null;

  if (!userId) {
    state.requestId += 1;
    state.userId = null;
    clearHistory();
    return;
  }

  const changed = state.userId !== userId;
  state.userId = userId;

  if (changed || !state.stories.length) {
    await loadHistory(userId);
  }
}

refreshButton.addEventListener("click", () => {
  if (state.userId) void loadHistory(state.userId);
});

async function initialize() {
  state.client = getSupabaseClient();
  state.storyService = createStoryService(state.client);

  const sessionResult = await state.client.auth.getSession();
  if (sessionResult.error) throw sessionResult.error;
  await applySession(sessionResult.data.session);

  state.client.auth.onAuthStateChange((_event, session) => {
    window.setTimeout(() => {
      void applySession(session);
    }, 0);
  });
}

initialize().catch((error) => {
  console.error("MoonTale account story history failed", error);
  setStatus("Saved stories are temporarily unavailable.", "error");
});
