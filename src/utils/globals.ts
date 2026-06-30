import type { AsyncLocalStorage } from "node:async_hooks";
import type { BrowserChannel } from "../browser/channel.ts";
import type {
  BrowserBridge,
  BrowserRegistry,
} from "../browser/cucumberShim.ts";
import type { BrowserSupport } from "../browser/loadSupport.ts";
import type { NodeSupport } from "../node/loadSupport.ts";

export type VitestWorker = {
  ctx?: {
    files?: { filepath?: string; testLocations?: number[] }[];
    projectName?: string;
  };
};

// Single global object the browser shim installs on globalThis so the Node-side
// commands can drive step/hook/World execution in the page by key.
export type VitestCucumberBrowser = {
  registry?: BrowserRegistry;
  bridge?: BrowserBridge;
  // The active Cucumber run's channel, carried per-run via AsyncLocalStorage so
  // concurrent sessions never clobber each other's binding. Stored on the global
  // so both module runners (command + loadSupport) share one ALS instance.
  runContext?: AsyncLocalStorage<BrowserChannel>;
  support?: BrowserSupport;
};

export type VitestCucumberNode = {
  support?: NodeSupport;
};

export const globalRef = globalThis as unknown as {
  __vitest_worker__?: VitestWorker;
  __vitest_cucumber_browser__?: VitestCucumberBrowser;
  __vitest_cucumber_node__?: VitestCucumberNode;
};
