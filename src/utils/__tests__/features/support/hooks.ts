import { After, Before } from "@cucumber/cucumber";

Before({ tags: "@skip" }, function before() {
  return "pending";
});

Before({ tags: "@failBefore" }, function failBefore() {
  throw new Error("Before hook failed intentionally");
});

After({ tags: "@failAfter" }, function failAfter() {
  throw new Error("After hook failed intentionally");
});
