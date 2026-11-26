// Functions as text, for what tells that one takes the World as its first argument: the runtime's
// pattern (`../thisFirst.ts`) and a build's marks
// (`../../../core/storybook/preset/firstParameterMarks.ts`) read the same ones.

/** Functions that take the World first. */
export const worldFirst = [
  "world => {}",
  "(world) => {}",
  "(world, count) => {}",
  "async world => {}",
  "async (world, count) => {}",
  "async(world)=>{}",
  // Default values, the first parameter's and a later one's.
  "(world = {}) => {}",
  "(world, count = 1) => {}",
  '(world, url = "http://example.test") => {}',
  // A type annotation Node stripped: blank space in its place.
  "(world      , count        ) => {}",
  // Over several lines, with comments.
  "(\n  world,\n  count,\n) => {}",
  "(\n  // The scenario's cart.\n  world,\n  count,\n) => {}",
  "(\n  // One line,\n  // then another.\n  world,\n) => {}",
  "(/* the cart */ world, count) => {}",
  "async (/* the cart */ /* still */ world) => {}",
  // A comment over several lines, and JavaScript's way to give a parameter its type.
  "(\n  /*\n   * The scenario's cart,\n   * one per scenario.\n   */\n  world,\n  count,\n) => {}",
  "(/** @type {Cart} */ world, /** @type {number} */ count) => {}",
  "(\n  /**\n   * @type {Cart}\n   */\n  world,\n) => {}",
  "(\n  // A line,\n  /* then a block */\n  world,\n) => {}",
];

/** Functions called as cucumber calls them. */
export const cucumbers = [
  "() => {}",
  "(count, world) => {}",
  "(cart) => {}",
  "(worldwide) => {}",
  "({ world }) => {}",
  "([world]) => {}",
  "(...world) => {}",
  "(/* world */ cart) => {}",
  "async => {}",
  // A `function` has its `this`.
  "function (world) {}",
  "function (world, count) {}",
  "function world() {}",
  "async function (world) {}",
  "function* (world) {}",
  // Functions whose text isn't an expression of its own.
  "({ world(count) {} }).world",
  "({ async world(count) {} }).world",
  "class world {}",
  "((world) => {}).bind(null)",
];
