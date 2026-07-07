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
  // Active run's channel in ALS so concurrent sessions don't clobber each other.
  // On globalThis so command and loadSupport module runners share one instance.
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
