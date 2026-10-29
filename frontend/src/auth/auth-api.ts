type ApiError = { error?: { code?: string; message?: string } };
type Payload<T> = { data?: T } & ApiError;

/** Read a typed Finance API envelope and preserve its public error message. */
export async function readData<T>(response: Response, fallback: string): Promise<T> {
  const payload = await response.json().catch(() => ({})) as Payload<T>;
  if (!response.ok) throw new Error(payload.error?.message ?? fallback);
  if (payload.data === undefined) throw new Error(fallback);
  return payload.data;
}

/** Public Supabase project configuration; response is not cacheable. */
export async function authConfig(): Promise<{ supabaseUrl: string; supabaseAnonKey: string }> {
  return readData<{ supabaseUrl: string; supabaseAnonKey: string }>(
    await fetch("/api/v1/user/session/config", { cache: "no-store" }),
    "La configuration d’authentification est indisponible.",
  );
}

/** Exchange a verified provider token for the HttpOnly Finance BFF session. */
export async function exchangeSession(accessToken: string): Promise<void> {
  await readData(
    await fetch("/api/v1/user/session", {
      method: "POST",
      credentials: "same-origin",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ accessToken }),
    }),
    "La session sécurisée n’a pas pu être créée.",
  );
}
