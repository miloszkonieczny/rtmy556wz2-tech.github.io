// This file contains browser-safe public configuration only.
// Never add a service_role key, sb_secret key, database password, or API secret.
export const SUPABASE_URL = "https://ftbpmhjcvhelchqoqjjr.supabase.co";
export const SUPABASE_PUBLISHABLE_KEY =
  "sb_publishable_2-mUqQdZ_GoIyr_WGeO-Ww_1kJFaV9H";

let supabaseClient = null;

export function getAuthCallbackContext(location = globalThis.location) {
  if (!location?.href) {
    throw new Error("The auth callback requires a browser location.");
  }

  const url = new URL(location.href);
  const search = url.searchParams;
  const hash = new URLSearchParams(url.hash.replace(/^#/, ""));
  const errorDescription =
    search.get("error_description") ||
    hash.get("error_description") ||
    search.get("error") ||
    hash.get("error") ||
    "";
  const hasCode = search.has("code");
  const hasTokens = hash.has("access_token");
  const recoveryHint =
    search.get("type") === "recovery" || hash.get("type") === "recovery";

  return Object.freeze({
    errorDescription,
    hasCallback: Boolean(
      hasCode || hasTokens || errorDescription || recoveryHint,
    ),
    hasCode,
    recoveryHint,
  });
}

export function createAuthCallbackTracker(context) {
  if (!context || typeof context.hasCallback !== "boolean") {
    throw new Error("An auth callback context is required.");
  }

  let status = context.errorDescription
    ? "invalid"
    : context.hasCallback
      ? "pending"
      : "none";
  let callbackSession = null;
  let initialSessionSeen = false;
  let resolveInitialSession;
  const initialSessionPromise = new Promise((resolve) => {
    resolveInitialSession = resolve;
  });

  return Object.freeze({
    observe(event, session) {
      if (event === "PASSWORD_RECOVERY") {
        if (session?.user) {
          status = "recovery";
          callbackSession = session;
        } else if (context.hasCallback) {
          status = "invalid";
        }
      } else if (
        event === "SIGNED_IN" &&
        context.hasCallback &&
        session?.user &&
        status !== "recovery"
      ) {
        status = context.recoveryHint ? "recovery" : "confirmation";
        callbackSession = session;
      }

      if (event === "INITIAL_SESSION" && !initialSessionSeen) {
        initialSessionSeen = true;
        resolveInitialSession({ event, session });
      }

      return status;
    },

    resolve(sessionResult = {}) {
      const session =
        callbackSession || sessionResult.data?.session || null;

      if (context.errorDescription) {
        status = "invalid";
        return {
          error: context.errorDescription,
          session: null,
          status,
        };
      }
      if (status === "recovery") {
        return { error: null, session: callbackSession || session, status };
      }
      if (status === "confirmation") {
        return { error: null, session: callbackSession || session, status };
      }
      if (!context.hasCallback) {
        return {
          error: sessionResult.error || null,
          session,
          status: "normal",
        };
      }
      if (context.recoveryHint && session?.user) {
        status = "recovery";
        callbackSession = session;
        return { error: null, session, status };
      }

      status = "invalid";
      return {
        error: sessionResult.error || new Error("Auth callback unresolved."),
        session,
        status,
      };
    },

    get status() {
      return status;
    },

    waitForInitialSession() {
      return initialSessionPromise;
    },
  });
}

export function getAccountRedirectUrl(location = globalThis.location) {
  if (!location?.href) {
    throw new Error("The account redirect URL requires a browser location.");
  }

  return new URL("./account.html", location.href).href;
}

export function getSupabaseClient(scope = globalThis) {
  if (supabaseClient) return supabaseClient;

  const createClient = scope.supabase?.createClient;
  if (typeof createClient !== "function") {
    throw new Error("The Supabase client library is unavailable.");
  }

  supabaseClient = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      flowType: "pkce",
    },
  });

  return supabaseClient;
}

export async function updateRecoveryPassword(client, password) {
  if (typeof client?.auth?.updateUser !== "function") {
    throw new Error("A Supabase auth client is required.");
  }
  return client.auth.updateUser({ password });
}
