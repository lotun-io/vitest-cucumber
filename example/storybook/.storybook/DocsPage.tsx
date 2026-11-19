import { featuresOf, onFeaturesChange } from "@lotun/vitest-cucumber/storybook";
import {
  Controls,
  Description,
  Heading,
  Primary,
  Source,
  Stories,
  Subtitle,
  Title,
  useOf,
} from "@storybook/addon-docs/blocks";
import { useSyncExternalStore } from "react";
// @ts-expect-error
import gherkin from "react-syntax-highlighter/dist/esm/languages/prism/gherkin";
import { SyntaxHighlighter } from "storybook/internal/components";

// Gherkin highlighting in docs code blocks (`<Source language="gherkin" />`): Storybook's highlighter
// bundles a few languages only.
SyntaxHighlighter.registerLanguage("gherkin", gherkin);

/** A stories file's features, live in `storybook dev`: the page follows the feature files as they're saved. */
const useFeaturesOf = (storiesFile: string) =>
  useSyncExternalStore(onFeaturesChange, () => featuresOf(storiesFile));

/**
 * The feature files whose scenarios run on the docs page's stories file, as Gherkin: a section of the
 * page as Storybook's own (`Heading`, with an anchor).
 */
const Features = () => {
  const { preparedMeta } = useOf("meta", ["meta"]);
  const features = useFeaturesOf(preparedMeta.parameters.fileName as string);
  if (features.length === 0) {
    return null;
  }
  return (
    <>
      <Heading>Behavior</Heading>
      {features.map(({ fileName, source }) => (
        <Source
          key={fileName}
          code={source}
          // @ts-expect-error Registered above: Storybook's types list only its built-in languages.
          language="gherkin"
          format={false}
        />
      ))}
    </>
  );
};

/** Every stories file's docs page (`./preview.tsx`): Storybook's own template, then its features. */
export const DocsPage = () => (
  <>
    <Title />
    <Subtitle />
    <Description />
    <Primary />
    <Controls />
    <Stories />
    <Features />
  </>
);
