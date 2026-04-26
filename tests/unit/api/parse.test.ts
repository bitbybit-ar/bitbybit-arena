import { describe, it, expect } from "vitest";
import { z } from "zod";
import { NextRequest } from "next/server";
import { parseBody, parseOptionalBody, parseQuery } from "@/lib/api/parse";
import { BadRequestError } from "@/lib/api/errors";

function jsonRequest(body: unknown, malformed = false): NextRequest {
  return new NextRequest("http://localhost/test", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: malformed ? "{not json" : body === undefined ? undefined : JSON.stringify(body),
  });
}

function getRequest(searchParams: Record<string, string>): NextRequest {
  const url = new URL("http://localhost/test");
  for (const [k, v] of Object.entries(searchParams)) {
    url.searchParams.set(k, v);
  }
  return new NextRequest(url, { method: "GET" });
}

const Schema = z.object({
  title: z.string().min(3, "Title must be at least 3 characters"),
  age: z.number().int().nonnegative("age must be non-negative"),
});

describe("parseBody", () => {
  it("returns parsed data on a valid body", async () => {
    const out = await parseBody(jsonRequest({ title: "hello", age: 30 }), Schema);
    expect(out).toEqual({ title: "hello", age: 30 });
  });

  it("throws BadRequestError with 'Invalid JSON body' on malformed JSON", async () => {
    await expect(
      parseBody(jsonRequest(null, true), Schema)
    ).rejects.toMatchObject({
      message: "Invalid JSON body",
      statusCode: 400,
      code: "bad_request",
    });
  });

  it("throws BadRequestError with the first issue formatted as 'path: message'", async () => {
    await expect(
      parseBody(jsonRequest({ title: "ab", age: 30 }), Schema)
    ).rejects.toBeInstanceOf(BadRequestError);

    try {
      await parseBody(jsonRequest({ title: "ab", age: 30 }), Schema);
    } catch (err) {
      expect((err as Error).message).toBe(
        "title: Title must be at least 3 characters"
      );
    }
  });

  it("uses the message alone when issue path is empty", async () => {
    const TopLevel = z
      .object({ a: z.string().optional() })
      .refine((v) => Object.keys(v).length > 0, "No fields to update");
    try {
      await parseBody(jsonRequest({}), TopLevel);
      throw new Error("should have thrown");
    } catch (err) {
      expect((err as Error).message).toBe("No fields to update");
    }
  });
});

describe("parseOptionalBody", () => {
  it("treats malformed JSON as an empty object", async () => {
    const Schema = z.object({ a: z.string().optional() });
    const out = await parseOptionalBody(jsonRequest(null, true), Schema);
    expect(out).toEqual({});
  });

  it("treats a missing body as an empty object", async () => {
    const Schema = z.object({ a: z.string().optional() });
    const out = await parseOptionalBody(jsonRequest(undefined), Schema);
    expect(out).toEqual({});
  });

  it("still validates the schema when fields are required", async () => {
    const Required = z.object({ a: z.string() });
    await expect(
      parseOptionalBody(jsonRequest({}), Required)
    ).rejects.toBeInstanceOf(BadRequestError);
  });
});

describe("parseQuery", () => {
  it("parses search params against the schema", () => {
    const Schema = z.object({ status: z.enum(["open", "closed"]) });
    expect(parseQuery(getRequest({ status: "open" }), Schema)).toEqual({
      status: "open",
    });
  });

  it("throws BadRequestError on schema failure", () => {
    const Schema = z.object({ status: z.enum(["open", "closed"]) });
    expect(() => parseQuery(getRequest({ status: "weird" }), Schema)).toThrow(
      BadRequestError
    );
  });

  it("supports schemas that .transform() a string field (e.g. CSV → array)", () => {
    const Schema = z.object({
      tags: z
        .string()
        .optional()
        .transform((s) => (s ? s.split(",") : [])),
    });
    expect(parseQuery(getRequest({ tags: "a,b,c" }), Schema)).toEqual({
      tags: ["a", "b", "c"],
    });
  });
});
