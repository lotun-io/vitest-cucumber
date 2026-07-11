import { setWorldConstructor } from "@cucumber/cucumber";
import type { Browser, BrowserContext, Page } from "@playwright/test";

export class PlaywrightWorld {
  browser!: Browser;
  context!: BrowserContext;
  page!: Page;
}
setWorldConstructor(PlaywrightWorld);
