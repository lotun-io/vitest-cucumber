import { expect, test, vi } from "vitest";
import { createStoriesLinks } from "../storiesLinks.ts";

const header = "/p/src/Header.stories.ts";
const button = "/p/src/Button.stories.tsx";

test("read both ways: a feature's stories file, a stories file's features; a feature naming none is kept", () => {
  const links = createStoriesLinks();
  links.link("/p/src/Header.feature", header);
  links.link("/p/features/Session.feature", header);
  links.link("/p/src/Card.feature");
  expect(links.storiesFileOf("/p/src/Header.feature")).toBe(header);
  expect(links.storiesFileOf("/p/src/Card.feature")).toBeUndefined();
  expect(links.featuresOf(header)).toEqual([
    "/p/src/Header.feature",
    "/p/features/Session.feature",
  ]);
  expect(links.featuresOf(button)).toEqual([]);
  expect(links.has("/p/src/Card.feature")).toBe(true);
  expect(links.has("/p/src/Other.feature")).toBe(false);
  expect(links.features()).toEqual([
    "/p/src/Header.feature",
    "/p/features/Session.feature",
    "/p/src/Card.feature",
  ]);
  expect(links.linked()).toEqual([
    ["/p/src/Header.feature", header],
    ["/p/features/Session.feature", header],
  ]);
});

test("linked to another stories file, or unlinked: taken out of the old one's features", () => {
  const links = createStoriesLinks();
  links.link("/p/src/Header.feature", header);
  links.link("/p/features/Session.feature", header);
  links.link("/p/features/Session.feature", button);
  expect(links.featuresOf(header)).toEqual(["/p/src/Header.feature"]);
  expect(links.featuresOf(button)).toEqual(["/p/features/Session.feature"]);
  links.unlink("/p/src/Header.feature");
  expect(links.has("/p/src/Header.feature")).toBe(false);
  expect(links.featuresOf(header)).toEqual([]);
  expect(links.linked()).toEqual([["/p/features/Session.feature", button]]);
  links.clear();
  expect(links.features()).toEqual([]);
  expect(links.featuresOf(button)).toEqual([]);
});

test("told only as something changes: a new link, another stories file, a feature forgotten", () => {
  const onChange = vi.fn();
  const links = createStoriesLinks(onChange);
  links.link("/p/src/Header.feature", header);
  expect(onChange).toHaveBeenCalledTimes(1);
  // The same again: nothing.
  links.link("/p/src/Header.feature", header);
  expect(onChange).toHaveBeenCalledTimes(1);
  links.link("/p/src/Header.feature");
  expect(onChange).toHaveBeenCalledTimes(2);
  links.unlink("/p/src/Header.feature");
  expect(onChange).toHaveBeenCalledTimes(3);
  // Not there: nothing.
  links.unlink("/p/src/Header.feature");
  expect(onChange).toHaveBeenCalledTimes(3);
});
