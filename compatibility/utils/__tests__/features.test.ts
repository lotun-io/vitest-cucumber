import { readdirSync } from "node:fs";
import { expect, test } from "vitest";
import { featuresDir } from "../generate.ts";
import { samples } from "../kit.ts";

/** The compatibility kit's feature files, by sample. */
const featureFiles = () =>
  readdirSync(featuresDir)
    .filter((file) => file.endsWith(".feature"))
    .map((file) => file.replace(/\.feature$/, ""));

// After a kit update: `pnpm compatibility:generate` writes them.
test("every sample of the installed kit has its feature file", () => {
  const features = featureFiles();
  expect(samples().filter((sample) => !features.includes(sample))).toEqual([]);
});

test("every feature file is a sample of the installed kit's", () => {
  const kitSamples = samples();
  expect(
    featureFiles().filter((sample) => !kitSamples.includes(sample)),
  ).toEqual([]);
});
