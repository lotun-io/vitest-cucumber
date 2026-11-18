import { setWorldConstructor, World } from "@cucumber/cucumber";

export class TestWorld extends World {
  value = 0;
  object = {};
}

setWorldConstructor(TestWorld);
