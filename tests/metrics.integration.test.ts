import { describe, expect, test } from "bun:test";
import { getOperationalMetrics, incrementOperationalMetric, metricForAuditAction } from "../src/core/metrics";

describe.skipIf(process.env.RUN_DB_INTEGRATION_TESTS !== "true")("operational metrics", () => {
  test("stores fixed hourly counters without request details", async () => {
    await incrementOperationalMetric("form.submitted");
    const metrics = await getOperationalMetrics(24);
    expect(metrics.totals["form.submitted"]).toBeGreaterThan(0);
    expect(metrics.rows.every((row) => ["bucketStart", "metric", "value"].every((key) => key in row))).toBe(true);
  });
});

describe("operational metric mapping", () => {
  test("maps only privacy-safe audit events", () => {
    expect(metricForAuditAction("form.submit")).toBe("form.submitted");
    expect(metricForAuditAction("media.upload")).toBe("media.changed");
    expect(metricForAuditAction("post.update")).toBeNull();
  });
});
