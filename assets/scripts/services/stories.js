const STORY_COLUMNS = [
  "id",
  "child_id",
  "title",
  "story_content",
  "topic",
  "target_language",
  "vocabulary",
  "created_at",
].join(",");

export class StorySessionError extends Error {
  constructor(message = "A signed-in parent account is required.") {
    super(message);
    this.name = "StorySessionError";
  }
}

function requiredText(value, fieldName) {
  const cleaned = String(value || "").trim();

  if (!cleaned) {
    throw new Error(`${fieldName} is required.`);
  }

  return cleaned;
}

function normalizeVocabulary(vocabulary) {
  if (!Array.isArray(vocabulary)) {
    return [];
  }

  return vocabulary
    .map((item) => String(item || "").trim())
    .filter(Boolean);
}

async function requireSignedInUser(client) {
  const userResult = await client.auth.getUser();

  if (
    userResult.error ||
    !userResult.data?.user?.id
  ) {
    throw new StorySessionError();
  }

  return userResult.data.user;
}

export function createStoryService(client) {
  if (!client?.auth || typeof client.from !== "function") {
    throw new Error("A Supabase client is required.");
  }

  return Object.freeze({
    async list({ childId = "" } = {}) {
      await requireSignedInUser(client);

      let query = client
        .from("stories")
        .select(STORY_COLUMNS)
        .order("created_at", { ascending: false });

      const normalizedChildId = String(childId || "").trim();

      if (normalizedChildId) {
        query = query.eq("child_id", normalizedChildId);
      }

      const result = await query;

      if (result.error) {
        throw result.error;
      }

      return Array.isArray(result.data) ? result.data : [];
    },

    async create({
      childId,
      title,
      storyContent,
      topic = "",
      targetLanguage,
      vocabulary = [],
    }) {
      await requireSignedInUser(client);

      const result = await client
        .from("stories")
        .insert({
          child_id: requiredText(
            childId,
            "Child profile",
          ),

          title: requiredText(
            title,
            "Story title",
          ),

          story_content: requiredText(
            storyContent,
            "Story content",
          ),

          topic:
            String(topic || "").trim() || null,

          target_language: requiredText(
            targetLanguage,
            "Target language",
          ),

          vocabulary:
            normalizeVocabulary(vocabulary),
        })
        .select(STORY_COLUMNS)
        .single();

      if (result.error) {
        throw result.error;
      }

      return result.data;
    },

    async remove(storyId) {
      await requireSignedInUser(client);

      const normalizedStoryId = requiredText(
        storyId,
        "Story",
      );

      const result = await client
        .from("stories")
        .delete()
        .eq("id", normalizedStoryId)
        .select("id")
        .maybeSingle();

      if (result.error) {
        throw result.error;
      }

      if (!result.data?.id) {
        throw new Error("The story was not found or could not be deleted.");
      }

      return result.data;
    },
  });
}
