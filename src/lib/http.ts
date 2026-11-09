import { ZodError, type ZodType } from "zod";
import { AppError, badRequest } from "./errors";

/**
 * Wraps a route handler so that every failure becomes a consistent JSON body:
 * `{ error: { code, message } }`. Expected failures (AppError, validation)
 * keep their status; anything else is logged and returned as a generic 500.
 */
export function route<Ctx>(
  handler: (request: Request, context: Ctx) => Promise<Response>,
) {
  return async (request: Request, context: Ctx): Promise<Response> => {
    try {
      return await handler(request, context);
    } catch (error) {
      if (error instanceof AppError) {
        return errorResponse(error.status, error.code, error.message);
      }
      if (error instanceof ZodError) {
        return errorResponse(400, "validation_error", error.issues[0]?.message ?? "Invalid request.");
      }
      console.error(error);
      return errorResponse(500, "internal_error", "Something went wrong. Please try again.");
    }
  };
}

function errorResponse(status: number, code: string, message: string) {
  return Response.json({ error: { code, message } }, { status });
}

export async function parseJson<T>(request: Request, schema: ZodType<T>): Promise<T> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    throw badRequest("Request body must be valid JSON.");
  }
  return schema.parse(body);
}
