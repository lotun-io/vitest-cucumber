import type { TestProject } from "vitest/node";
import { publishReport } from "./publish.ts";

export function setup(project: TestProject) {
  return async () => {
    await publishReport(project.name);
  };
}
