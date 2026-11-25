import { After, AfterAll, Before, BeforeAll } from "@cucumber/cucumber";
import type { Browser } from "@playwright/test";
import { chromium } from "@playwright/test";
import type { PlaywrightWorld } from "./world.ts";

let browser: Browser;

BeforeAll(async () => {
  browser = await chromium.launch({ headless: true });
});

AfterAll(async () => {
  await browser.close();
});

Before(async (world: PlaywrightWorld) => {
  world.browser = browser;
  world.context = await browser.newContext();
  world.page = await world.context.newPage();
});

After(async (world: PlaywrightWorld) => {
  await world.context.close();
});
