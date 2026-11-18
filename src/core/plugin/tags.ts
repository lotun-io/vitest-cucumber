// Gherkin tags as Vitest tags. Vitest rejects a test tag it doesn't know, and a tag filter naming
// one (`--tags-filter`: the run's error, whatever `strictTags`), so the tags of every feature file
// of a project are declared on it before the workers start, not only the run's files' (a run of
// one file filtered by another file's tag skips its tests, as with a tag of Vitest's config). A tag
// the user already defined (e.g. with its own `retry`) is left as it is.
import type { TestProject } from "vitest/node";

/** Declares the Gherkin `tags` on `project`. */
export const declareTags = (project: TestProject, tags: readonly string[]) => {
  const definitions = (project.config.tags ??= []);
  for (const tag of tags) {
    if (!definitions.some(({ name }) => name === tag)) {
      definitions.push({ name: tag, description: "Gherkin tag" });
    }
  }
};
