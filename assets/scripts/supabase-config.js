// This file contains browser-safe public configuration only.
// Never add a service_role key, sb_secret key, database password, or API secret.
export const SUPABASE_URL = "https://ftbpmhjcvhelchqoqjjr.supabase.co";
export const SUPABASE_PUBLISHABLE_KEY =
  "sb_publishable_2-mUqQdZ_GoIyr_WGeO-Ww_1kJFaV9H";

let supabaseClient = null;

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
