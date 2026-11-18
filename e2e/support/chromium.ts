// The e2e and compatibility projects' global setup, in Vitest's main process: one Chromium for the
// whole run (Playwright's browser server), its endpoint provided to the workers (`e2eChromium`).
// The scenarios' default configs connect to it (`./project.ts`), each Vitest in a browser context
// of its own, instead of launching a Chromium each. Firefox and WebKit, used by a few rows only,
// are launched by their scenarios' Vitest. Both projects share the one server: launched by the
// first setup, closed by the last teardown.
import { type BrowserServer, chromium } from "playwright";
import type { TestProject } from "vitest/node";

declare module "vitest" {
  export interface ProvidedContext {
    /** The shared Chromium's endpoint (Playwright's `connect`). */
    e2eChromium: string;
  }
}

const shared = globalThis as {
  __e2eChromium?: { server: Promise<BrowserServer>; users: number };
};

export default async (project: TestProject) => {
  shared.__e2eChromium ??= {
    server: chromium.launchServer({ headless: true }),
    users: 0,
  };
  const entry = shared.__e2eChromium;
  entry.users++;
  project.provide("e2eChromium", (await entry.server).wsEndpoint());
  return async () => {
    entry.users--;
    if (entry.users === 0) {
      shared.__e2eChromium = undefined;
      await (await entry.server).close();
    }
  };
};
