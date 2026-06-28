import { Given, Then } from "@cucumber/cucumber";
import { expect } from "vitest";
import { TestWorld } from "../support/world.ts";

// Browser-only: needs a real DOM and the page locator, so scenarios using these
// steps are tagged @notNode.

Given(
  "the value {int} is rendered",
  function render(this: TestWorld, n: number) {
    this.value = n;
    // @ts-expect-error — no DOM lib in this project's tsconfig; runs in the page.
    document.body.innerHTML = `<p>value=${n}</p>`;
  },
);

Then(
  "the rendered text should be {string}",
  async function rendered(text: string) {
    const { page } = await import("vitest/browser");
    // Real vitest/browser locator + web-first assertion, in the page.
    await expect.element(page.getByText(text)).toBeVisible();
  },
);
