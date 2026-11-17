// Errors: values at module boundaries; transports translate them.

export class AppError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly httpStatus: number,
  ) {
    super(message);
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
