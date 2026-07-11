import { Given, Then } from "@cucumber/cucumber";
import { expect } from "@playwright/test";
import type { PlaywrightWorld } from "../support/world.ts";

Given(
  "the URL {string} returns:",
  async function mockUrl(this: PlaywrightWorld, url: string, body: string) {
    await this.context.route(url, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "text/html",
        body,
      });
    });
  },
);

Given(
  "I open the URL {string}",
  async function openUrl(this: PlaywrightWorld, url: string) {
    await this.page.goto(url);
  },
);

Given(
  "the page title should be {string}",
  async function checkTitle(this: PlaywrightWorld, title: string) {
    await expect(this.page).toHaveTitle(title);
  },
);
