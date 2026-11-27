// The runner in Storybook's own preview (dev server or static build), on the preview's platform: a
// story's target, and cucumber's BeforeAll and AfterAll as Storybook's `beforeAll` and its cleanup
// (`./annotation.ts`): BeforeAll once, unless it ran (a story played first runs it, its error the
// story's), AfterAll once after it (a later story runs BeforeAll again). A story can't be skipped: a
// skipped scenario passes, with its skip as a note. A failed story's annotations (its attachments,
// logs and links, as story tests give Vitest them) show after its steps, one note each, as Vitest's
// default reporter shows a failed test's: a passing story's don't. Without the preset (the support
// module the placeholder: no `importSupport`), a story fails with the reason. Preview only.
import type { ImportSupport } from "../../../types/feature.ts";
import type {
  HookOutcome,
  LoadRun,
  Platform,
} from "../../../types/platform.ts";
import { pluginError } from "../../../utils/errors.ts";
import { type PageRunner, storyNote } from "../story.ts";
import { platform } from "./platform.ts";
import { cwd, importSupport, options } from "./support.ts";

/** Storybook's preview's runner: also cucumber's BeforeAll and AfterAll, its project `beforeAll`'s. */
export interface PreviewRunner extends PageRunner {
  beforeAll(): Promise<void>;
  afterAll(): Promise<void>;
}

/**
 * A preview runner on `platform`, loading the support code for `run` through `importSupport` (none:
 * the preset isn't serving the support module), its notes added by `note` (the page's: the support
 * module's, `storyNote`).
 */
export const createPreviewRunner = ({
  platform,
  run,
  importSupport,
  note,
}: {
  platform: Platform;
  run: LoadRun;
  importSupport: ImportSupport | undefined;
  note: (label: string) => void;
}): PreviewRunner => {
  // The support code it loads, at its first story (`ensureBeforeAll`).
  if (importSupport) {
    platform.use(run, importSupport);
  }
  let beforeAll: Promise<HookOutcome> | undefined;

  /** Loads the support code, and runs the BeforeAll hooks unless they ran: their error. */
  const ensureBeforeAll = async () => {
    if (!importSupport) {
      throw pluginError(
        "the preview's support code isn't served (is `cucumber({ … })` from `@lotun/vitest-cucumber/storybook/node` in Storybook's addons?)",
        { quiet: true },
      );
    }
    await platform.load();
    const before = await (beforeAll ??= platform.beforeAll());
    if (!before.passed) {
      throw before.error;
    }
  };

  return {
    run: async (scenario) => {
      await ensureBeforeAll();
      const outcome = await platform.scenario(scenario);
      if (outcome.error) {
        for (const { type, message } of outcome.annotations) {
          note(`${type}: ${message}`);
        }
        throw outcome.error.value;
      }
      if (outcome.skipped) {
        const { note: skipNote } = outcome.skipped;
        note(`Skipped${skipNote ? `: ${skipNote}` : ""}`);
      }
    },
    beforeAll: ensureBeforeAll,
    /** Runs the AfterAll hooks, once, if BeforeAll ran. */
    afterAll: async () => {
      if (!beforeAll) {
        return;
      }
      beforeAll = undefined;
      const after = await platform.afterAll();
      if (after && !after.passed) {
        throw after.error;
      }
    },
  };
};

/** The page's runner: the preview's platform, its support module. */
export const runner = createPreviewRunner({
  platform,
  run: { cwd, options },
  importSupport,
  note: storyNote,
});
