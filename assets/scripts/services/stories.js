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

export function createStoryService(client) {
  if (!client?.auth || typeof client.from !== "function") {
    throw new Error("A Supabase client is required.");
  }

  return Object.freeze({
    async create({
      childId,
      title,
      storyContent,
      topic = "",
      targetLanguage,
      vocabulary = [],
    }) {
      const userResult = await client.auth.getUser();

      if (
        userResult.error ||
        !userResult.data?.user?.id
      ) {
        throw new Error(
          "A signed-in parent account is required.",
        );
      }

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
  });
}
