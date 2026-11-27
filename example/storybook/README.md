# Storybook example

A React + Vite Storybook project where feature files are stories. Storybook's `stories` lists the
feature files: each is a stories file of its own, a story for each scenario and Outline row, on the
stories file its Background names (`Given the stories of "./Login.stories.ts"`), on the story its
step names (`Given the "LoggedIn" story`, or `"default"` for the meta). Each story renders as usual,
and its play runs the scenario's steps.

The same stories run in three places:

- **Vitest**, with Storybook's Vitest addon: `pnpm test`.
- **Storybook's UI**: `pnpm storybook`. Each scenario's steps show in the Interactions panel.
- **A static build**: `pnpm build-storybook`.

## Run it

```sh
pnpm install
pnpm test          # every story as a Vitest test
pnpm test:smoke    # only the stories tagged @smoke
pnpm storybook     # Storybook's UI on http://localhost:6006
```

## Setup

- [`.storybook/main.ts`](.storybook/main.ts): the feature files in `stories`, and the plugin in
  `addons`, next to `@storybook/addon-vitest`: `cucumber({ import: ["features/**/*.ts"] })` from
  `@lotun/vitest-cucumber/storybook/node`, with its options, for Storybook and its story tests.
  `import` lists the support code (steps, hooks, the World).
- [`.storybook/preview.tsx`](.storybook/preview.tsx): autodocs for every stories file, with the
  docs page below as its template.
- [`.storybook/DocsPage.tsx`](.storybook/DocsPage.tsx): that docs page, Storybook's own template
  with a `Features` block after it (`featuresOf`: the features that run on the page's stories file,
  as Gherkin), and Gherkin highlighting (`SyntaxHighlighter.registerLanguage`).
- [`vite.config.ts`](vite.config.ts): the Vitest project of Storybook's addon, without `cucumber()`
  (the addon gives it the plugin). `api.allowWrite` keeps the data of attachments. With `TAGS` set, only stories with those tags run (`test:smoke`).

## What each story shows

| Stories | Feature file | What it shows |
| --- | --- | --- |
| `Example/Greeting` | [`Greeting.feature`](src/stories/Greeting.feature) | The documentation's example: a Scenario and a Scenario Outline on the stories their steps name (`Ada`, `Grace`), and a scenario on `Basic`, the meta's args as they are. |
| `Example/Login` | [`Login.feature`](src/stories/Login.feature) | A Background, a Scenario and a Scenario Outline. Its `Behavior` page ([`Login.mdx`](src/stories/Login.mdx)) shows the feature as highlighted Gherkin (Vite's `?raw` import). |
| `Example/Account` | [`Account.feature.md`](src/stories/Account.feature.md) | A feature file in Markdown. Its `Behavior` page ([`Account.mdx`](src/stories/Account.mdx)) renders it as a document (`?raw`). |
| `Example/Button` | [`Button.feature`](src/stories/Button.feature) | Outline rows on the stories file's own stories, one per row (`Given the "<story>" story`: `Primary`, …), which give them their `args`. The `@smoke` rows are Storybook tags too. A scenario on an unmounted story (`Given the unmounted "Primary" story`): its step mounts it with a label of its own (`mount(createElement(component, …))`). |
| `Example/Header` | [`Header.feature`](src/stories/Header.feature) | Scenarios on the stories their Storybook steps name: those stories' `args`, the meta's spies (`fn()`). |
| `Example/Header` | [`features/header/Session.feature`](features/header/Session.feature) | A feature file away from its stories file: its stories file step (`Given the stories of "src/stories/Header.stories.ts"`) names `Header.stories.ts`, a second feature on it next to `Header.feature`, as `Feature: Session`. |
| `Example/Form` | [`Form.feature`](src/stories/Form.feature) | A data table, a doc string and a parameter type of its own ([`features/steps/form.ts`](features/steps/form.ts)). |
| `Example/UserCard` | [`UserCard.feature`](src/stories/UserCard.feature) | `Before` and `After` hooks for `@api` scenarios, logs and attachments ([`features/support/hooks.ts`](features/support/hooks.ts)). |
| `Example/Page` | none | An ordinary story with its own `play`, next to the others. |

## The support code

[`features/`](features/) holds the support code, as `import` in `.storybook/main.ts` lists it
(`features/**/*.ts`): the step definitions in [`features/steps/`](features/steps/), the World and the
hooks in [`features/support/`](features/support/). The Storybook steps
([`features/steps/stories.ts`](features/steps/stories.ts)) link a feature to its stories file and a
scenario to its story with the plugin's placeholders (`{storybook:story}`); their code does nothing. Storybook has already
rendered the story when its steps run, so steps don't render anything. They
use the running story's context (`canvas`, `userEvent`, `args`) through the World:

```ts
// features/support/world.ts
import { setWorldConstructor, World } from "@cucumber/cucumber";
import { story } from "@lotun/vitest-cucumber/storybook";
import type { StoryContext } from "@storybook/react-vite";

export class StoryWorld extends World {
  get story() {
    return story<StoryContext>();
  }
}

setWorldConstructor(StoryWorld);
```

```ts
// features/steps/steps.ts
When("I click the {string} button", async function (this: StoryWorld, name: string) {
  const { canvas, userEvent } = this.story;
  await userEvent.click(canvas.getByRole("button", { name }));
});
```

## Docs

[Storybook mode](https://lotun-io.github.io/vitest-cucumber/modes/storybook) in the plugin's docs.
