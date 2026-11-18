// Hooks around the scenarios tagged `@api` (`src/stories/UserCard.feature`): `fetch` answers with a
// user of ours while the scenario runs, then is put back, the user it gave attached.
import { After, Before } from "@cucumber/cucumber";
import type { StoryWorld } from "./world.ts";

const user = { name: "Ada Lovelace", email: "ada@example.com" };
let realFetch: typeof fetch | undefined;

Before({ tags: "@api" }, function (this: StoryWorld) {
  realFetch = globalThis.fetch;
  globalThis.fetch = async () => Response.json(user);
  this.log("fetch answers with a user of our own");
});

After({ tags: "@api" }, function (this: StoryWorld) {
  if (realFetch) {
    globalThis.fetch = realFetch;
  }
  this.attach(JSON.stringify(user), { mediaType: "application/json", fileName: "user.json" });
});
