import { Before } from "@cucumber/cucumber";
import type { ArithmeticWorld } from "./world.ts";

// This hook only runs for scenarios tagged with @preset-10
Before({ tags: "@preset-10" }, function (this: ArithmeticWorld) {
  this.value = 10;
});
