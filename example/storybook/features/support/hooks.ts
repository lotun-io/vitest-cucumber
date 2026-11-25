// Hooks around the scenarios tagged `@api` (`src/stories/UserCard.feature`): `fetch` answers with a
// user of ours while the scenario runs, then is put back, the user it gave attached.
import { After, Before } from "@cucumber/cucumber";
import type { StoryWorld } from "./world.ts";

const user = { name: "Ada Lovelace", email: "ada@example.com" };
let realFetch: typeof fetch | undefined;

Before({ tags: "@api" }, (world: StoryWorld) => {
  realFetch = globalThis.fetch;
  globalThis.fetch = async () => Response.json(user);
  world.log("fetch answers with a user of our own");
});

After({ tags: "@api" }, (world: StoryWorld) => {
  if (realFetch) {
    globalThis.fetch = realFetch;
  }
  world.attach(JSON.stringify(user), { mediaType: "application/json", fileName: "user.json" });
});
