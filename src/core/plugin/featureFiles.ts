// A Vitest project's feature files: its test files (Vitest's `include` and `exclude`; a Storybook
// project's from its `stories`) that are feature files, absolute. Their tags are declared as the
// project is set up (`./createPlugin.ts`), and a watching Vitest reruns them all as the support
// files' list changes (`./watchReruns.ts`).
import type { TestProject } from "vitest/node";
import { featureOfTestFile } from "../feature/featureFile.ts";

export const featureFilesOf = async (
  project: Pick<TestProject, "globTestFiles">,
) =>
  (await project.globTestFiles()).testFiles.flatMap(
    (file) => featureOfTestFile(file) ?? [],
  );
