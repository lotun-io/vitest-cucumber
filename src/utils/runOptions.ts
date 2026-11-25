// The run's options where the user gave none: cucumber's defaults (its `DEFAULT_CONFIGURATION`),
// the one place they're written. Main's configuration takes them from here
// (`../core/plugin/options.ts`), and so does what runs with no main to ask (the preview's support
// module's placeholder: `../worker/storybook/preview/support.ts`).
import type { RunOptions } from "../types/feature.ts";

export const defaultRunOptions = {
  strict: true,
  dryRun: false,
  worldParameters: {},
} satisfies RunOptions;
