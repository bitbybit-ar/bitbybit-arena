// Stable, machine-readable error codes for API responses. The server
// pairs every thrown ApiError with a code; the client maps the code to
// `errors.codes.<code>` in the locale bundle. The English `message`
// stays as a fallback for codes the client doesn't know about (older
// clients, new server codes), but the localized translation is the
// source of truth on screen.
export type ApiErrorCode =
  | "unauthorized"
  | "rate_limit"
  | "internal"
  | "not_found"
  | "forbidden"
  | "bad_request"
  | "conflict"
  | "challenge_not_accepting_participants"
  | "already_joined"
  | "already_withdrawn"
  | "cannot_withdraw_completed"
  | "challenge_cancelled"
  | "challenge_completed"
  | "must_join_first"
  | "missing_target_event"
  | "like_not_found"
  | "missing_hashtag"
  | "hashtag_post_not_found"
  | "proof_too_short"
  | "duplicate_proof"
  | "cannot_delete_active_challenge"
  | "award_not_participants"
  | "already_awarded"
  | "missing_pubkey"
  | "no_metadata_found"
  | "invalid_invoice"
  | "auth_missing_header"
  | "auth_invalid_scheme"
  | "auth_invalid_base64"
  | "auth_invalid_signature"
  | "auth_clock_skew"
  | "network_error"
  | "checkpoint_already_completed"
  | "checkpoint_in_review"
  | "checkpoint_prior_required";

export class ApiError extends Error {
  public code: ApiErrorCode;
  constructor(public statusCode: number, message: string, code: ApiErrorCode) {
    super(message);
    this.code = code;
  }
}

export class UnauthorizedError extends ApiError {
  constructor(message = "Unauthorized", code: ApiErrorCode = "unauthorized") {
    super(401, message, code);
  }
}

export class NotFoundError extends ApiError {
  constructor(resource = "Resource", code: ApiErrorCode = "not_found") {
    super(404, `${resource} not found`, code);
  }
}

export class BadRequestError extends ApiError {
  constructor(message: string, code: ApiErrorCode = "bad_request") {
    super(400, message, code);
  }
}

export class ForbiddenError extends ApiError {
  constructor(message = "Forbidden", code: ApiErrorCode = "forbidden") {
    super(403, message, code);
  }
}

export class ConflictError extends ApiError {
  constructor(message: string, code: ApiErrorCode = "conflict") {
    super(409, message, code);
  }
}

export class RateLimitError extends ApiError {
  public retryAfterMs: number;
  constructor(retryAfterMs: number, message = "Too many requests. Try again later.") {
    super(429, message, "rate_limit");
    this.retryAfterMs = retryAfterMs;
  }
}
