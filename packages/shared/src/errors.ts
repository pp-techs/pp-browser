export type ErrorCode =
  | "INVALID_INPUT"
  | "NOT_FOUND"
  | "CONFLICT"
  | "NOT_RUNNING"
  | "LIMIT_REACHED"
  | "PROXY_DOWN"
  | "ENGINE_ERROR"
  | "UNAUTHORIZED"
  | "INTERNAL";

const STATUS: Record<ErrorCode, number> = {
  INVALID_INPUT: 400,
  UNAUTHORIZED: 401,
  NOT_FOUND: 404,
  CONFLICT: 409,
  NOT_RUNNING: 409,
  LIMIT_REACHED: 429,
  PROXY_DOWN: 502,
  ENGINE_ERROR: 500,
  INTERNAL: 500,
};

export class PpbError extends Error {
  readonly code: ErrorCode;

  constructor(code: ErrorCode, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "PpbError";
    this.code = code;
  }

  get status(): number {
    return STATUS[this.code];
  }

  toJSON(): { error: { code: ErrorCode; message: string } } {
    return { error: { code: this.code, message: this.message } };
  }
}
