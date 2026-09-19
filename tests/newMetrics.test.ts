import { describe, expect, it } from "vitest";
import { labels, metricGroups } from "../src/report";

describe("new health categories", () => {
  it("extends Vitals and Sleep & activity with the new metrics", () => {
    const vitals = metricGroups.find((g) => g.title === "Vitals")!.metrics;
    expect(vitals).toEqual(
      expect.arrayContaining([
        "bodyMassIndex",
        "bodyFatPercentage",
        "waistCircumference",
        "leanBodyMass",
        "heartRateVariability",
        "oxygenSaturation",
        "respiratoryRate",
      ]),
    );
    const activity = metricGroups.find((g) => g.title === "Sleep & activity")!.metrics;
    expect(activity).toEqual(expect.arrayContaining(["vo2Max", "walkingHeartRateAverage"]));
  });

  it("keeps glucose and insulin out of the generic dashboard groups", () => {
    const all = metricGroups.flatMap((g) => g.metrics);
    expect(all).not.toContain("bloodGlucose");
    expect(all).not.toContain("insulinDelivery");
  });

  it("labels the new metrics", () => {
    expect(labels.bloodGlucose).toBe("Blood glucose");
    expect(labels.insulinDelivery).toBe("Insulin delivery");
    expect(labels.oxygenSaturation).toBe("Blood oxygen");
    expect(labels.vo2Max).toBe("Cardio fitness (VO₂ max)");
  });
});
