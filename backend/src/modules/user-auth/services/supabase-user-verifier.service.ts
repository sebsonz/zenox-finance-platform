export interface SupabaseAuthUser {
  id: string;
  email?: string;
  emailConfirmedAt?: string | null;
}

export class SupabaseTokenVerificationError extends Error {
  constructor(
    message: string,
    readonly code: "INVALID_TOKEN" | "AUTH_PROVIDER_UNAVAILABLE" | "INVALID_CONFIGURATION",
  ) {
    super(message);
    this.name = "SupabaseTokenVerificationError";
  }
}

export interface SupabaseUserVerifierOptions {
  supabaseUrl: string;
  anonKey: string;
  accessToken: string;
  fetchImpl?: typeof fetch;
}

/**
 * Verify a Supabase access token through Supabase Auth's user endpoint.
 *
 * This deliberately asks the configured Auth service to validate the bearer
 * token instead of decoding an unverified JWT locally. The anon/publishable
 * key is a project identifier, not a service-role secret; it remains server
 * configuration here and must never be replaced with a service-role key.
 */
export async function verifySupabaseAccessToken(
  options: SupabaseUserVerifierOptions,
): Promise<SupabaseAuthUser> {
  const { supabaseUrl, anonKey, accessToken } = options;
  let parsedUrl: URL;

  try {
    parsedUrl = new URL(supabaseUrl);
  } catch {
    throw new SupabaseTokenVerificationError("Supabase URL is invalid", "INVALID_CONFIGURATION");
  }

  if (
    !["https:", "http:"].includes(parsedUrl.protocol) ||
    (parsedUrl.protocol === "http:" && parsedUrl.hostname !== "localhost" && parsedUrl.hostname !== "127.0.0.1") ||
    parsedUrl.username.length > 0 ||
    parsedUrl.password.length > 0 ||
    parsedUrl.search.length > 0 ||
    parsedUrl.hash.length > 0 ||
    !anonKey.trim() ||
    !/^[A-Za-z0-9._~-]{20,4096}$/.test(accessToken)
  ) {
    throw new SupabaseTokenVerificationError("Supabase authentication configuration or token is invalid", "INVALID_CONFIGURATION");
  }

  let response: Response;
  try {
    response = await (options.fetchImpl ?? fetch)(
      new URL("/auth/v1/user", parsedUrl.origin),
      {
        method: "GET",
        headers: {
          apikey: anonKey,
          authorization: `Bearer ${accessToken}`,
          accept: "application/json",
        },
        signal: AbortSignal.timeout(5000),
      },
    );
  } catch {
    throw new SupabaseTokenVerificationError("Supabase Auth could not be reached", "AUTH_PROVIDER_UNAVAILABLE");
  }

  if (response.status === 401 || response.status === 403) {
    throw new SupabaseTokenVerificationError("Supabase access token is invalid or expired", "INVALID_TOKEN");
  }

  if (!response.ok) {
    throw new SupabaseTokenVerificationError("Supabase Auth returned an unexpected response", "AUTH_PROVIDER_UNAVAILABLE");
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new SupabaseTokenVerificationError("Supabase Auth response was invalid", "AUTH_PROVIDER_UNAVAILABLE");
  }

  if (
    typeof payload !== "object" ||
    payload === null ||
    !("id" in payload) ||
    typeof payload.id !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(payload.id)
  ) {
    throw new SupabaseTokenVerificationError("Supabase Auth response did not contain a valid user identity", "AUTH_PROVIDER_UNAVAILABLE");
  }

  const email = "email" in payload && typeof payload.email === "string" ? payload.email : undefined;
  const emailConfirmedAt = "email_confirmed_at" in payload && typeof payload.email_confirmed_at === "string"
    ? payload.email_confirmed_at
    : "confirmed_at" in payload && typeof payload.confirmed_at === "string"
      ? payload.confirmed_at
      : undefined;
  return {
    id: payload.id,
    ...(email === undefined ? {} : { email }),
    ...(emailConfirmedAt === undefined ? {} : { emailConfirmedAt }),
  };
}
