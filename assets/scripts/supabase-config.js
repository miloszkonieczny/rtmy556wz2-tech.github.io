// This file contains browser-safe public configuration only.
// Never add a service_role key, sb_secret key, database password, or API secret.
export const SUPABASE_URL = "https://ftbpmhjcvhelchqoqjjr.supabase.co";
export const SUPABASE_PUBLISHABLE_KEY =
  "sb_publishable_2-mUqQdZ_GoIyr_WGeO-Ww_1kJFaV9H";

let supabaseClient = null;

const AUTH_SEARCH_PARAMETERS = [
  "code",
  "error",
  "error_code",
  "error_description",
  "token_hash",
  "type",
];
const AUTH_HASH_PARAMETERS = [
  "access_token",
  "expires_at",
  "expires_in",
  "refresh_token",
  "token_type",
  ...AUTH_SEARCH_PARAMETERS,
];

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
  const tokenHash = search.get("token_hash") || hash.get("token_hash") || "";
  const isRecoveryType =
    search.get("type") === "recovery" || hash.get("type") === "recovery";
  const recoveryHint = Boolean(
    isRecoveryType &&
      (hasCode || hasTokens || tokenHash || errorDescription),
  );
  const isRecoveryTokenHash = Boolean(tokenHash && isRecoveryType);

  return Object.freeze({
    errorDescription,
    hasCallback: Boolean(
      hasCode || hasTokens || tokenHash || errorDescription || isRecoveryType,
    ),
    hasCode,
    isRecoveryTokenHash,
    recoveryHint,
    tokenHash,
  });
}

export function getCleanAuthCallbackUrl(location = globalThis.location) {
  if (!location?.href) {
    throw new Error("The auth callback cleanup requires a browser location.");
  }

  const url = new URL(location.href);
  AUTH_SEARCH_PARAMETERS.forEach((name) => url.searchParams.delete(name));

  const hash = new URLSearchParams(url.hash.replace(/^#/, ""));
  const hasHashAuthParameter = AUTH_HASH_PARAMETERS.some((name) =>
    hash.has(name),
  );
  if (hasHashAuthParameter) {
    AUTH_HASH_PARAMETERS.forEach((name) => hash.delete(name));
    const remainingHash = hash.toString();
    url.hash = remainingHash ? `#${remainingHash}` : "";
  }

  return `${url.pathname}${url.search}${url.hash}`;
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

export async function verifyRecoveryToken(client, tokenHash) {
  if (typeof client?.auth?.verifyOtp !== "function") {
    throw new Error("A Supabase auth client is required.");
  }
  if (typeof tokenHash !== "string" || !tokenHash.trim()) {
    throw new Error("A password-recovery token hash is required.");
  }

  return client.auth.verifyOtp({
    token_hash: tokenHash,
    type: "recovery",
  });
}

export async function updateRecoveryPassword(client, password) {
  if (typeof client?.auth?.updateUser !== "function") {
    throw new Error("A Supabase auth client is required.");
  }
  return client.auth.updateUser({ password });
}

function loadAccountStoryHistory() {
  if (
    typeof document === "undefined" ||
    document.body?.dataset.page !== "account" ||
    document.querySelector('script[data-account-stories-loader]')
  ) {
    return;
  }

  const stylesheet = document.createElement("link");
  stylesheet.rel = "stylesheet";
  stylesheet.href =
    "./assets/styles/account-stories.css?v=20260727-account-stories";
  document.head.appendChild(stylesheet);

  const loaderMarker = document.createElement("script");
  loaderMarker.type = "application/json";
  loaderMarker.dataset.accountStoriesLoader = "";
  document.head.appendChild(loaderMarker);

  void import(
    "./pages/account-stories.js?v=20260727-account-stories"
  ).catch((error) => {
    console.error("MoonTale account story history could not be loaded", error);
  });
}

if (typeof document !== "undefined") {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", loadAccountStoryHistory, {
      once: true,
    });
  } else {
    loadAccountStoryHistory();
  }
}
