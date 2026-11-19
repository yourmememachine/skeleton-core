// Errors: values at module boundaries; transports translate them.

export class AppError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly httpStatus: number,
  ) {
    super(message);
    // A status outside 100-599 would crash the HTTP transport's error
    // path itself (writeHead throws), hanging the client it was trying
    // to answer — reject it here, at construction.
    if (!Number.isInteger(httpStatus) || httpStatus < 100 || httpStatus > 599) {
      throw new Error(`AppError httpStatus must be an integer 100-599, got ${httpStatus}`);
    }
    this.name = new.target.name;
  }
}

export class NotFoundError extends AppError {
  constructor(what: string) {
    super(`${what} not found`, "NOT_FOUND", 404);
  }
}

export class ValidationError extends AppError {
  constructor(detail: string) {
    super(`Validation failed: ${detail}`, "VALIDATION", 400);
  }
}
