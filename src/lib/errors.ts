/** An expected failure that maps directly to an HTTP status and a user-facing message. */
export class AppError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export const unauthorized = () =>
  new AppError(401, "unauthorized", "Please sign in.");
export const forbidden = (message = "You don't have permission to do that.") =>
  new AppError(403, "forbidden", message);
// Used for both "does not exist" and "exists but you have no access", so the
// API never reveals which document ids are real.
export const notFound = () =>
  new AppError(404, "not_found", "Document not found.");
export const badRequest = (message: string) =>
  new AppError(400, "bad_request", message);
export const conflict = (message: string) =>
  new AppError(409, "conflict", message);
