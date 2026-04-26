import { describe, it, expect } from "vitest";
import {
  ApiError,
  BadRequestError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
  RateLimitError,
  UnauthorizedError,
} from "@/lib/api/errors";

describe("ApiError hierarchy", () => {
  it("ApiError carries statusCode, message, and code", () => {
    const err = new ApiError(418, "I'm a teapot", "internal");
    expect(err).toBeInstanceOf(Error);
    expect(err.statusCode).toBe(418);
    expect(err.message).toBe("I'm a teapot");
    expect(err.code).toBe("internal");
  });

  it("UnauthorizedError defaults to 401 + 'unauthorized'", () => {
    const err = new UnauthorizedError();
    expect(err).toBeInstanceOf(ApiError);
    expect(err.statusCode).toBe(401);
    expect(err.code).toBe("unauthorized");
    expect(err.message).toBe("Unauthorized");
  });

  it("UnauthorizedError accepts a custom code (e.g. auth_clock_skew)", () => {
    const err = new UnauthorizedError("Clock skew", "auth_clock_skew");
    expect(err.code).toBe("auth_clock_skew");
    expect(err.statusCode).toBe(401);
  });

  it("NotFoundError formats the message as '<resource> not found'", () => {
    const err = new NotFoundError("Challenge");
    expect(err.statusCode).toBe(404);
    expect(err.message).toBe("Challenge not found");
    expect(err.code).toBe("not_found");
  });

  it("BadRequestError defaults to 400 + 'bad_request'", () => {
    const err = new BadRequestError("Invalid foo");
    expect(err.statusCode).toBe(400);
    expect(err.code).toBe("bad_request");
  });

  it("BadRequestError accepts a domain-specific code", () => {
    const err = new BadRequestError("Invalid invoice", "invalid_invoice");
    expect(err.code).toBe("invalid_invoice");
  });

  it("ForbiddenError defaults to 403 + 'forbidden'", () => {
    const err = new ForbiddenError();
    expect(err.statusCode).toBe(403);
    expect(err.code).toBe("forbidden");
  });

  it("ConflictError defaults to 409 + 'conflict'", () => {
    const err = new ConflictError("Already joined");
    expect(err.statusCode).toBe(409);
    expect(err.code).toBe("conflict");
  });

  it("ConflictError accepts a domain code (e.g. already_joined)", () => {
    const err = new ConflictError("Already joined", "already_joined");
    expect(err.code).toBe("already_joined");
  });

  it("RateLimitError carries retryAfterMs and code='rate_limit'", () => {
    const err = new RateLimitError(5_000);
    expect(err.statusCode).toBe(429);
    expect(err.code).toBe("rate_limit");
    expect(err.retryAfterMs).toBe(5_000);
  });
});
