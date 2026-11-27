// What the runtime takes from its platform (node mode's worker, a page: browser mode's, Storybook's
// story tests' and its preview's): what cucumber's own runtime gets from Node and from cucumber's
// package. The rest of the runtime is the same everywhere (`../worker/runner/`). Page-safe.
import type { IWorldOptions } from "@cucumber/cucumber";
import type { AttachmentContentEncoding } from "@cucumber/messages";

/**
 * Where a platform keeps the running test case's World and BeforeAll or AfterAll hook's context
 * while their code runs (node mode: `AsyncLocalStorage`; a page has none: a variable).
 */
export interface Scope {
  /** The running test case's World, if any. */
  world(): object | undefined;
  /** The running BeforeAll or AfterAll hook's context, if any. */
  context(): object | undefined;
  /** Runs `run` with `world` as the World (a step, a case or step hook, a transformer). */
  withWorld<T>(world: object, run: () => Promise<T>): Promise<T>;
  /** Runs `run` with `context` as the context (a BeforeAll or AfterAll hook). */
  withContext<T>(context: object, run: () => Promise<T>): Promise<T>;
  /** A test case has ended. */
  endTestCase(): void;
}

/** An attachment as cucumber's attachment manager gives it to its runtime. */
interface Attachment {
  data: string;
  media: { encoding: AttachmentContentEncoding; contentType: string };
  fileName?: string;
}

/** Cucumber's attachment manager: a World's `attach`, `log` and `link`. */
interface AttachmentManager {
  /** A World's `attach` (the page's: strings only). */
  create(...args: never[]): unknown;
  log: IWorldOptions["log"];
  link: IWorldOptions["link"];
}

export interface RuntimeEnvironment {
  /** Cucumber's attachment manager, each attachment to `onAttachment`. */
  AttachmentManager: new (
    onAttachment: (attachment: Attachment) => void,
  ) => AttachmentManager;
  /** An async definition's run, failed by an uncaught error while it runs. */
  uncaught: {
    race(running: PromiseLike<unknown>): Promise<unknown>;
    /** Ends what a run left behind (a call that never ended, e.g. a timed-out step). */
    stopAll(): void;
  };
  /** Cucumber's `world` and `context` while a definition runs (`../worker/cucumber/scope.ts`). */
  scope: Scope;
  /**
   * The default timeouts, a definition's own `timeout` aside, the host's (Vitest's `testTimeout` and
   * `hookTimeout`, Storybook's preview's own): `test` a scenario's steps' and hooks', `hook`
   * BeforeAll's and AfterAll's (`-1`: none).
   */
  defaultTimeouts: { test: number; hook: number };
  /**
   * Runs a definition's code inside `around`, if the platform has it (Storybook: a step of the
   * story): a step's (`label` its text as the feature file reads, keyword included) or a BeforeAll
   * or AfterAll hook's (`BeforeAll`, `AfterAll`). A case or step hook's isn't. `run` gives the
   * definition's outcome, its `failure` the real error, if it failed (`../worker/runner/userCode.ts`).
   */
  around?<T extends { failure?: { value: unknown } }>(
    label: string,
    run: () => Promise<T>,
  ): Promise<T>;
  /**
   * The host's rewrite of a step definition's cucumber expression (a Storybook host's: its
   * Storybook steps' placeholders as `{string}`, `../utils/storybookPlaceholders.ts`; none in node
   * and browser mode).
   */
  expressionOf?(expression: string): string;
}

/** A mode's own runtime pieces (node mode's, a page's): its host adds the default timeouts. */
export type ModeEnvironment = Omit<RuntimeEnvironment, "defaultTimeouts">;
