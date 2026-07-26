export const AGE_GROUPS = Object.freeze({
  "3-5": "3–5 years",
  "6-8": "6–8 years",
  "9-11": "9–11 years",
  "12+": "12+ years",
});

export const PROFILE_LANGUAGES = Object.freeze({
  en: "English",
  pl: "Polish",
  es: "Spanish",
  fr: "French",
  de: "German",
});

export const CHILD_PROFILE_COLUMNS = Object.freeze([
  "id",
  "parent_id",
  "nickname",
  "age_group",
  "native_language",
  "target_language",
  "interests",
  "created_at",
  "updated_at",
]);

export class ProfileSessionError extends Error {
  constructor(message = "Your session has expired.") {
    super(message);
    this.name = "ProfileSessionError";
  }
}

function normalizeChoice(value, allowedValues, fieldName) {
  const normalized = String(value || "").trim();
  if (!allowedValues.includes(normalized)) {
    throw new Error(`Choose a valid ${fieldName}.`);
  }
  return normalized;
}

export function normalizeInterests(value) {
  const rawInterests = Array.isArray(value)
    ? value
    : String(value || "").split(",");
  const uniqueInterests = new Map();

  rawInterests.forEach((rawInterest) => {
    const interest = String(rawInterest || "").trim();
    if (!interest) return;
    if (interest.length > 60) {
      throw new Error("Each interest must be 60 characters or fewer.");
    }

    const key = interest.toLocaleLowerCase();
    if (!uniqueInterests.has(key)) uniqueInterests.set(key, interest);
  });

  const interests = [...uniqueInterests.values()];
  if (interests.length > 20) {
    throw new Error("Add no more than 20 interests.");
  }
  return interests;
}

export function childProfilePayload(values = {}) {
  const nickname = String(values.nickname || "").trim();
  if (!nickname || nickname.length > 80) {
    throw new Error("Nickname must be between 1 and 80 characters.");
  }

  return {
    nickname,
    age_group: normalizeChoice(
      values.age_group,
      Object.keys(AGE_GROUPS),
      "age group",
    ),
    native_language: normalizeChoice(
      values.native_language,
      Object.keys(PROFILE_LANGUAGES),
      "home language",
    ),
    target_language: normalizeChoice(
      values.target_language,
      Object.keys(PROFILE_LANGUAGES),
      "learning language",
    ),
    interests: normalizeInterests(values.interests),
  };
}

export function profileFormValues(profile = {}) {
  return {
    nickname: profile.nickname || "",
    age_group: profile.age_group || "",
    native_language: profile.native_language || "",
    target_language: profile.target_language || "",
    interests: normalizeInterests(profile.interests).join(", "),
  };
}

export function ageGroupLabel(ageGroup) {
  return AGE_GROUPS[ageGroup] || "Age group unavailable";
}

export function languageLabel(language) {
  return PROFILE_LANGUAGES[language] || "Language unavailable";
}

function dataOrThrow(result) {
  if (result.error) throw result.error;
  return result.data;
}

function requireProfileId(profileId) {
  const normalized = String(profileId || "").trim();
  if (!normalized) throw new Error("A child profile is required.");
  return normalized;
}

async function getAuthenticatedUser(client) {
  const result = await client.auth.getUser();
  if (result.error) {
    const message = String(result.error.message || "").toLowerCase();
    const isSessionError =
      result.error.status === 401 ||
      result.error.status === 403 ||
      message.includes("session") ||
      message.includes("jwt") ||
      message.includes("expired") ||
      message.includes("refresh token");
    if (!isSessionError) throw result.error;
  }
  if (!result.data?.user?.id) {
    throw new ProfileSessionError();
  }
  return result.data.user;
}

export function createChildProfileService(client) {
  if (!client?.auth || typeof client.from !== "function") {
    throw new Error("A Supabase client is required.");
  }

  const columns = CHILD_PROFILE_COLUMNS.join(",");

  return Object.freeze({
    async list() {
      const user = await getAuthenticatedUser(client);
      const result = await client
        .from("child_profiles")
        .select(columns)
        .eq("parent_id", user.id)
        .order("created_at", { ascending: true });
      return dataOrThrow(result) || [];
    },

    async create(values) {
      const user = await getAuthenticatedUser(client);
      const payload = childProfilePayload(values);
      const result = await client
        .from("child_profiles")
        .insert({ ...payload, parent_id: user.id })
        .select(columns)
        .single();
      return dataOrThrow(result);
    },

    async update(profileId, values) {
      const user = await getAuthenticatedUser(client);
      const payload = childProfilePayload(values);
      const result = await client
        .from("child_profiles")
        .update(payload)
        .eq("id", requireProfileId(profileId))
        .eq("parent_id", user.id)
        .select(columns)
        .single();
      return dataOrThrow(result);
    },

    async remove(profileId) {
      const user = await getAuthenticatedUser(client);
      const result = await client
        .from("child_profiles")
        .delete()
        .eq("id", requireProfileId(profileId))
        .eq("parent_id", user.id)
        .select("id")
        .single();
      return dataOrThrow(result);
    },
  });
}
