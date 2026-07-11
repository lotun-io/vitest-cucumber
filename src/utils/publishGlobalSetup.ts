import type { TestProject } from "vitest/node";
import { publishReport } from "./publish.ts";

export const setup = (project: TestProject) => {
  return async () => {
    await publishReport(project.name);
  };
};
