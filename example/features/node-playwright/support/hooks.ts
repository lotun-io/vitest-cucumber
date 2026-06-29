import { After, AfterAll, Before, BeforeAll } from "@cucumber/cucumber";
import type { Browser } from "@playwright/test";
import { chromium } from "@playwright/test";
import type { PlaywrightWorld } from "./world.ts";

let browser: Browser;

BeforeAll(async function launchBrowser() {
  browser = await chromium.launch({ headless: true });
});

AfterAll(async function closeBrowser() {
  await browser.close();
});

Before(async function openPage(this: PlaywrightWorld) {
  this.browser = browser;
  this.context = await browser.newContext();
  this.page = await this.context.newPage();
});

After(async function closePage(this: PlaywrightWorld) {
  await this.context.close();
});
