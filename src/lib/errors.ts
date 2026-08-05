/** Typed application error mapped to an HTTP status by the error middleware. */
export class AppError extends Error {
  status: number;
  code: string;
  details?: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.code = code;
    this.details = details;
  }

  static badRequest(message: string, details?: unknown) {
    return new AppError(400, 'bad_request', message, details);
  }
  static unauthorized(message = 'Authentication required.') {
    return new AppError(401, 'unauthorized', message);
  }
  static forbidden(message = 'You do not have access to this resource.') {
    return new AppError(403, 'forbidden', message);
  }
  static notFound(message = 'Resource not found.') {
    return new AppError(404, 'not_found', message);
  }
  static conflict(message: string) {
    return new AppError(409, 'conflict', message);
  }
  static validation(message: string, details?: unknown) {
    return new AppError(422, 'validation', message, details);
  }
  static tooMany(message = 'Too many attempts. Please try again later.') {
    return new AppError(429, 'rate_limited', message);
  }
  static server(message = 'Something went wrong.') {
    return new AppError(500, 'server_error', message);
  }
}
