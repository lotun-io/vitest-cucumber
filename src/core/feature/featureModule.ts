// The code of a feature file's test module, from its plan (`./plans.ts`), one of two blocks. A
// feature file that can't be used (its plan failed: it doesn't parse): a suite that throws its
// error, so its file fails with it and no tests (`../utils/errorCode.ts`), as Storybook's story
// tests do. A feature that can run: it imports the runtime and the mode's platform, then calls the
// runtime's `feature({ plan, platform, importSupport })` with the file's plan (as plain data) and
// a function that imports the support files; importing them from the module itself lets Vite rerun
// it when one changes. A runtime function the generated code calls with more than one value takes
// them as one object.
import type { Feature } from "../../types/feature.ts";
import { importSupportCode } from "../support/importSupportCode.ts";
import { failingSuiteCode } from "../utils/errorCode.ts";
import { ownModule } from "../utils/ownModule.ts";
import type { FailedPlan, VitestPlan } from "./plans.ts";

/** The runtime module, every mode's feature modules' (`../../worker/feature/runtime.ts`). */
const runtime = ownModule("worker/feature/runtime");

interface FeatureModuleOptions {
  /** The path of the mode's `Platform` module. */
  platform: string;
  /** The project's root, cucumber's `cwd`. */
  cwd: string;
  /** The feature file's plan. */
  plan: VitestPlan | FailedPlan;
}

export const featureModule = ({
  platform,
  cwd,
  plan,
}: FeatureModuleOptions) => {
  if ("error" in plan) {
    return failingSuiteCode(plan.error);
  }
  const { uri, featureTree, gherkin, options, supportFiles } = plan;
  const feature: Feature = { cwd, uri, featureTree, options, gherkin };
  return [
    `import { feature } from ${JSON.stringify(runtime)};`,
    `import { platform } from ${JSON.stringify(platform)};`,
    `feature({ plan: ${JSON.stringify(feature)}, platform, importSupport: ${importSupportCode(supportFiles)} });`,
  ].join("\n");
};
