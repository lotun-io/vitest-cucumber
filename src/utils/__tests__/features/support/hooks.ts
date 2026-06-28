import { AfterAll, BeforeAll } from "@cucumber/cucumber";

BeforeAll(function beforeAll() {
  if (process.env.FAIL_BEFORE_ALL) {
    throw new Error("BeforeAll failed intentionally");
  }
});

AfterAll(function afterAll() {
  if (process.env.FAIL_AFTER_ALL) {
    throw new Error("AfterAll failed intentionally");
  }
});
