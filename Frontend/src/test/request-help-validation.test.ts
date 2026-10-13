import { describe, expect, it } from "vitest";

import { requestHelpSchema } from "@/routes/request-help";

describe("Request help validation", () => {
  it("allows empty description and medical concerns", () => {
    const result = requestHelpSchema.safeParse({
      category: "immediate_rescue",
      urgency: "urgent",
      name: "",
      phone: "",
      contactMethod: "phone",
      people: 1,
      description: "",
      medicalConcerns: "",
      hasImage: false,
      location: { lat: 27.7172, lng: 85.324 },
    });

    expect(result.success).toBe(true);
  });
});
