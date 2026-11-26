import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { expect, test } from "vitest";
import { featureOf, featuresDir } from "../generate.ts";
import { samples } from "../kit.ts";

/** The compatibility kit's feature files, by sample. */
const featureFiles = () =>
  readdirSync(featuresDir)
    .filter((file) => file.endsWith(".feature"))
    .map((file) => file.replace(/\.feature$/, ""));

/** A sample's committed feature file (its line ends git's own on Windows), if it has one. */
const committed = (sample: string) => {
  try {
    return readFileSync(
      path.join(featuresDir, `${sample}.feature`),
      "utf8",
    ).replaceAll("\r\n", "\n");
  } catch {
    return undefined;
  }
};

// After a kit update, or a change to `../known.ts` or `../generate.ts`: `pnpm
// compatibility:generate` writes them.
test("every sample of the installed kit has its feature file, as generated", () => {
  expect(
    samples().filter((sample) => committed(sample) !== featureOf(sample)),
  ).toEqual([]);
});

test("every feature file is a sample of the installed kit's", () => {
  const kitSamples = samples();
  expect(
    featureFiles().filter((sample) => !kitSamples.includes(sample)),
  ).toEqual([]);
});
