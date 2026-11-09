/** Browser-side fetch wrapper that understands the API's error shape. */
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export async function api<T = unknown>(path: string, init: RequestInit = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, {
      ...init,
      headers:
        typeof init.body === "string"
          ? { "Content-Type": "application/json", ...init.headers }
          : init.headers,
    });
  } catch {
    throw new ApiError(0, "Can't reach the server. Check your connection.");
  }
  if (response.status === 204) return undefined as T;
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    throw new ApiError(
      response.status,
      body?.error?.message ?? "Something went wrong. Please try again.",
    );
  }
  return body as T;
}

export const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : "Something went wrong. Please try again.";
