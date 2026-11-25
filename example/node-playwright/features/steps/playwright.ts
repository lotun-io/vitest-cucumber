import { Given } from "@cucumber/cucumber";
import { expect } from "@playwright/test";
import type { PlaywrightWorld } from "../support/world.ts";

Given(
  "the URL {string} returns:",
  async (world: PlaywrightWorld, url: string, body: string) => {
    await world.context.route(url, async (route) => {
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
  async (world: PlaywrightWorld, url: string) => {
    await world.page.goto(url);
  },
);

Given(
  "the page title should be {string}",
  async (world: PlaywrightWorld, title: string) => {
    await expect(world.page).toHaveTitle(title);
  },
);
