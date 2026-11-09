import { describe, expect, it } from "vitest";
import { databaseConfig } from "@/db/client";

describe("databaseConfig", () => {
  it("uses a local SQLite file when nothing is configured locally", () => {
    expect(databaseConfig({})).toEqual({ url: "file:local.db", authToken: undefined });
  });

  it("prefers DATABASE_URL and falls back to the Turso integration's names", () => {
    expect(
      databaseConfig({ DATABASE_URL: "libsql://a.turso.io", DATABASE_AUTH_TOKEN: "t1" }),
    ).toEqual({ url: "libsql://a.turso.io", authToken: "t1" });
    expect(
      databaseConfig({ TURSO_DATABASE_URL: "libsql://b.turso.io", TURSO_AUTH_TOKEN: "t2" }),
    ).toEqual({ url: "libsql://b.turso.io", authToken: "t2" });
  });

  it("refuses to fall back to a local file on Vercel, with a message saying what to set", () => {
    expect(() => databaseConfig({ VERCEL: "1" })).toThrow(/DATABASE_URL/);
  });
});
