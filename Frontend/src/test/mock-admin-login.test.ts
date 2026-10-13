import { describe, expect, it } from "vitest";
import { api, IS_MOCK } from "@/services/api";

describe("mock admin sign-in", () => {
  it("grants the admin preview role only for the seeded demo credentials", async () => {
    expect(IS_MOCK).toBe(true);

    const admin = await api.login("admin@jalrakshak.local", "change-this-password");
    expect(admin.user.role).toBe("admin");
    expect(admin.user.email).toBe("admin@jalrakshak.local");

    await expect(api.login("admin@jalrakshak.local", "wrong-password")).rejects.toThrow(
      "Invalid email or password",
    );
  });
});