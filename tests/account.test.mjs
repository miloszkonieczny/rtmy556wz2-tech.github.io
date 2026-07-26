import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  CHILD_PROFILE_COLUMNS,
  ProfileSessionError,
  childProfilePayload,
  createChildProfileService,
  normalizeInterests,
  profileFormValues,
} from "../assets/scripts/services/child-profiles.js";
import {
  SUPABASE_PUBLISHABLE_KEY,
  SUPABASE_URL,
  getAccountRedirectUrl,
  getSupabaseClient,
} from "../assets/scripts/supabase-config.js";

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));

function readProjectFile(filePath) {
  return readFileSync(join(repoRoot, filePath), "utf8");
}

test("Supabase uses the configured public project values and one persistent v2 client", () => {
  assert.equal(SUPABASE_URL, "https://ftbpmhjcvhelchqoqjjr.supabase.co");
  assert.equal(
    SUPABASE_PUBLISHABLE_KEY,
    "sb_publishable_2-mUqQdZ_GoIyr_WGeO-Ww_1kJFaV9H",
  );
  assert.equal(
    getAccountRedirectUrl({
      href: "https://moontaleapp.com/account.html?code=temporary",
    }),
    "https://moontaleapp.com/account.html",
  );

  const calls = [];
  const expectedClient = { auth: {}, from() {} };
  const scope = {
    supabase: {
      createClient(url, key, options) {
        calls.push({ url, key, options });
        return expectedClient;
      },
    },
  };

  assert.equal(getSupabaseClient(scope), expectedClient);
  assert.equal(getSupabaseClient(scope), expectedClient);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].options.auth.persistSession, true);
  assert.equal(calls[0].options.auth.autoRefreshToken, true);
  assert.equal(calls[0].options.auth.detectSessionInUrl, true);
  assert.equal(calls[0].options.auth.flowType, "pkce");
});

test("child-profile payload uses the exact database fields and normalizes safe values", () => {
  const payload = childProfilePayload({
    nickname: "  Nova  ",
    age_group: "6-8",
    native_language: "pl",
    target_language: "en",
    interests: " Space, animals, space,  mysteries ",
    parent_id: "must-not-pass-through",
  });

  assert.deepEqual(payload, {
    nickname: "Nova",
    age_group: "6-8",
    native_language: "pl",
    target_language: "en",
    interests: ["Space", "animals", "mysteries"],
  });
  assert.equal(Object.hasOwn(payload, "parent_id"), false);
  assert.deepEqual(
    CHILD_PROFILE_COLUMNS,
    [
      "id",
      "parent_id",
      "nickname",
      "age_group",
      "native_language",
      "target_language",
      "interests",
      "created_at",
      "updated_at",
    ],
  );
});

test("child-profile validation rejects invalid or excessive data", () => {
  assert.throws(
    () =>
      childProfilePayload({
        nickname: "",
        age_group: "6-8",
        native_language: "pl",
        target_language: "en",
      }),
    /Nickname/,
  );
  assert.throws(
    () =>
      childProfilePayload({
        nickname: "Nova",
        age_group: "unknown",
        native_language: "pl",
        target_language: "en",
      }),
    /age group/,
  );
  assert.throws(
    () =>
      normalizeInterests(
        Array.from({ length: 21 }, (_, index) => `interest-${index}`),
      ),
    /20 interests/,
  );
  assert.throws(
    () => normalizeInterests("a".repeat(61)),
    /60 characters/,
  );
});

test("profile values safely round-trip between database records and the form", () => {
  assert.deepEqual(
    profileFormValues({
      nickname: "Milo",
      age_group: "3-5",
      native_language: "en",
      target_language: "es",
      interests: ["Moon", "Animals"],
    }),
    {
      nickname: "Milo",
      age_group: "3-5",
      native_language: "en",
      target_language: "es",
      interests: "Moon, Animals",
    },
  );
});

test("profile creation obtains the authenticated user and sets parent_id itself", async () => {
  const calls = [];
  const storedProfile = {
    id: "profile-1",
    parent_id: "parent-1",
    nickname: "Nova",
    age_group: "6-8",
    native_language: "pl",
    target_language: "en",
    interests: ["Space"],
  };
  const client = {
    auth: {
      async getUser() {
        calls.push({ method: "getUser" });
        return { data: { user: { id: "parent-1" } }, error: null };
      },
    },
    from(table) {
      assert.equal(table, "child_profiles");
      return {
        insert(payload) {
          calls.push({ method: "insert", payload });
          return {
            select(columns) {
              calls.push({ method: "select", columns });
              return {
                async single() {
                  return { data: storedProfile, error: null };
                },
              };
            },
          };
        },
      };
    },
  };

  const service = createChildProfileService(client);
  const result = await service.create({
    nickname: "Nova",
    age_group: "6-8",
    native_language: "pl",
    target_language: "en",
    interests: "Space",
    parent_id: "attacker-controlled",
  });

  assert.equal(result, storedProfile);
  assert.deepEqual(
    calls.find((call) => call.method === "insert").payload,
    {
      nickname: "Nova",
      age_group: "6-8",
      native_language: "pl",
      target_language: "en",
      interests: ["Space"],
      parent_id: "parent-1",
    },
  );
  assert.equal(calls[0].method, "getUser");
});

test("profile list, update and delete operations remain scoped to the authenticated parent", async () => {
  const queries = [];
  const updatedProfile = {
    id: "profile-1",
    parent_id: "parent-1",
    nickname: "Nova",
    age_group: "9-12",
    native_language: "pl",
    target_language: "de",
    interests: ["Robots"],
  };
  const client = {
    auth: {
      async getUser() {
        return { data: { user: { id: "parent-1" } }, error: null };
      },
    },
    from(table) {
      assert.equal(table, "child_profiles");
      const query = {
        calls: [],
        result: { data: [], error: null },
        select(columns) {
          this.calls.push(["select", columns]);
          return this;
        },
        eq(column, value) {
          this.calls.push(["eq", column, value]);
          return this;
        },
        order(column, options) {
          this.calls.push(["order", column, options]);
          return this;
        },
        update(payload) {
          this.calls.push(["update", payload]);
          this.result = { data: updatedProfile, error: null };
          return this;
        },
        delete() {
          this.calls.push(["delete"]);
          this.result = { data: { id: "profile-1" }, error: null };
          return this;
        },
        async single() {
          this.calls.push(["single"]);
          return this.result;
        },
        then(resolve, reject) {
          return Promise.resolve(this.result).then(resolve, reject);
        },
      };
      queries.push(query);
      return query;
    },
  };

  const service = createChildProfileService(client);
  assert.deepEqual(await service.list(), []);
  await service.update("profile-1", {
    nickname: "Nova",
    age_group: "9-12",
    native_language: "pl",
    target_language: "de",
    interests: "Robots",
    parent_id: "must-not-be-updated",
  });
  await service.remove("profile-1");

  queries.forEach((query) => {
    assert.equal(
      query.calls.some(
        (call) =>
          call[0] === "eq" &&
          call[1] === "parent_id" &&
          call[2] === "parent-1",
      ),
      true,
    );
  });
  const updatePayload = queries[1].calls.find(
    (call) => call[0] === "update",
  )[1];
  assert.equal(Object.hasOwn(updatePayload, "parent_id"), false);
  assert.deepEqual(queries[2].calls.slice(0, 3), [
    ["delete"],
    ["eq", "id", "profile-1"],
    ["eq", "parent_id", "parent-1"],
  ]);
});

test("profile operations fail before querying when no authenticated user exists", async () => {
  const client = {
    auth: {
      async getUser() {
        return { data: { user: null }, error: new Error("expired") };
      },
    },
    from() {
      assert.fail("The database should not be queried without a user.");
    },
  };

  await assert.rejects(
    () => createChildProfileService(client).list(),
    ProfileSessionError,
  );
});

test("account page exposes complete auth and profile controls without parent_id input", () => {
  const html = readProjectFile("account.html");
  const supabaseCdnPosition = html.indexOf(
    "@supabase/supabase-js@2.49.4/dist/umd/supabase.min.js",
  );
  const accountModulePosition = html.indexOf(
    'src="./assets/scripts/pages/account.js',
  );
  assert.match(
    html,
    /@supabase\/supabase-js@2\.49\.4\/dist\/umd\/supabase\.min\.js/,
  );
  assert.ok(supabaseCdnPosition > -1);
  assert.ok(accountModulePosition > supabaseCdnPosition);
  assert.match(html, /id="login-form"/);
  assert.match(html, /id="signup-form"/);
  assert.match(html, /id="forgot-password-form"/);
  assert.match(html, /id="new-password-form"/);
  assert.match(html, /id="logout-button"/);
  assert.match(html, /id="profile-form"/);
  assert.match(html, /name="nickname"/);
  assert.match(html, /name="age_group"/);
  assert.match(html, /name="native_language"/);
  assert.match(html, /name="target_language"/);
  assert.match(html, /name="interests"/);
  assert.doesNotMatch(html, /name="parent_id"/);
  assert.match(html, /role="status"/);
  assert.match(html, /data-loading-label=/);
});

test("account implementation uses safe DOM rendering and includes required Supabase flows", () => {
  const accountScript = readProjectFile("assets/scripts/pages/account.js");
  const profileService = readProjectFile(
    "assets/scripts/services/child-profiles.js",
  );
  const config = readProjectFile("assets/scripts/supabase-config.js");
  const browserSources = [accountScript, profileService, config].join("\n");

  assert.equal(accountScript.includes(".innerHTML"), false);
  assert.match(accountScript, /\.textContent = profile\.nickname/);
  assert.match(accountScript, /signUp\(/);
  assert.match(accountScript, /signInWithPassword\(/);
  assert.match(accountScript, /resetPasswordForEmail\(/);
  assert.match(accountScript, /updateUser\(\{ password \}\)/);
  assert.match(accountScript, /signOut\(\{ scope: "local" \}\)/);
  assert.match(accountScript, /setFormBusy/);
  assert.match(profileService, /parent_id: user\.id/);
  const vitePrefix = ["VI", "TE", "_"].join("");
  assert.equal(browserSources.includes(vitePrefix), false);
  assert.doesNotMatch(
    browserSources,
    /\bservice_role\b\s*[:=]\s*["'][^"']+["']/,
  );
  assert.doesNotMatch(browserSources, /\bsb_secret_[A-Za-z0-9_-]+/);
  assert.doesNotMatch(browserSources, /\bsk-[A-Za-z0-9_-]{16,}/);
});
