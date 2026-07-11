import { describe, expect, it } from "vitest";
import { runCucumber } from "../index.ts";

const feature = (name: string) => `features/${name}`;

describe("runCucumber", () => {
  it("returns PASSED for a passing scenario", async () => {
    const { featureName, results } = await runCucumber({
      id: feature("simple.feature"),
      config: { name: ["^A single passing step$"] },
    });

    expect(featureName).toBe("Simple scenarios");
    expect(results).toHaveLength(1);
    expect(results[0].status).toBe("PASSED");
    expect(results[0].error).toBeUndefined();
  });

  it("returns FAILED with a createError-shaped error for a failing scenario", async () => {
    const { results } = await runCucumber({
      id: "src/browser/__browser__/features/failing.feature",
    });

    expect(results).toHaveLength(1);
    expect(results[0].status).toBe("FAILED");
    expect(results[0].error).toBeDefined();
  });

  it("respects name filter — returns empty when no scenario matches", async () => {
    const { results } = await runCucumber({
      id: feature("simple.feature"),
      config: { name: ["^This scenario does not exist$"] },
    });

    expect(results).toHaveLength(0);
  });

  it("returns SKIPPED status for a skipped scenario", async () => {
    const { results } = await runCucumber({
      id: feature("skip.feature"),
      config: { name: ["^A skipped scenario is not executed$"] },
    });

    expect(results).toHaveLength(1);
    expect(results[0].status).toBe("SKIPPED");
    expect(results[0].error).toBeUndefined();
  });
});
