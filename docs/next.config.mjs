import nextra from "nextra";

// Search: Pagefind's index, built after `next build` (package.json's `postbuild`).
const withNextra = nextra({});

export default withNextra({
  // A static site for GitHub Pages, served at lotun-io.github.io/vitest-cucumber/.
  output: "export",
  basePath: "/vitest-cucumber",
  images: { unoptimized: true },
});
