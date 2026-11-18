// Cucumber's `World` for the plugin's `@cucumber/cucumber` stand-in, both modes (a copy of 13.3.0's
// `lib/support_code_library_builder/world.ts`). Page-safe.
import type * as Cucumber from "@cucumber/cucumber";

/** Cucumber's World. `attach`, `log` and `link` are its test case's (`../runner/testCaseRunner.ts`). */
export class World implements Cucumber.IWorld {
  readonly attach: Cucumber.IWorld["attach"];
  readonly log: Cucumber.IWorld["log"];
  readonly link: Cucumber.IWorld["link"];
  readonly parameters: unknown;

  constructor({ attach, log, link, parameters }: Cucumber.IWorldOptions) {
    this.attach = attach;
    this.log = log;
    this.link = link;
    this.parameters = parameters;
  }
}
