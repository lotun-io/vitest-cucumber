import { Before } from "@cucumber/cucumber";

Before({ tags: "@skip" }, function before() {
  return "pending";
});
