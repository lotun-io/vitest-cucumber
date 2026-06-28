import { setWorldConstructor, World } from "@cucumber/cucumber";

// One World for both realms. `extends World` (the base class exists in node's
// real runtime AND the browser shim) wires up IWorldOptions — attach/log/link
// and `parameters` (the configured worldParameters) — so the same steps run in
// node and browser unchanged.
export class TestWorld extends World {
  value = 0;
  object = {};
  hookCount = 0;
  beforeStepCount = 0;
  afterStepCount = 0;
  scenarioName = "";
  tagExpr = false;
}

setWorldConstructor(TestWorld);

// setDefaultTimeout(100);
