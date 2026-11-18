// A feature file's plan, from its Gherkin, as cucumber parses it (`@cucumber/gherkin`, the steps of
// cucumber's own `gherkin-streams`: the media type by the file's extension, `.md` Gherkin in
// Markdown, then `generateMessages`): its test tree, its parse errors, and its Gherkin document and
// pickles, which the worker or the page runs. Of the user's configuration only the default language
// applies. Vitest, not cucumber, filters the tests (tags, names). Its ids (the document's, the
// pickles') are the file's: UUIDs (v5) under a namespace made from its path, language and content,
// by position, so every plugin (a project's own `cucumber()`) makes the same for the same file, and
// a run's report has each file once (`../runs/runStart.ts`).
import { generateMessages, makeSourceEnvelope } from "@cucumber/gherkin";
import {
  SourceMediaType,
  type GherkinDocument,
  type Pickle,
} from "@cucumber/messages";
import { v5 } from "uuid";
import type { FeatureGherkin, FeatureSuite } from "../../types/feature.ts";
import { featureTree } from "./featureTree.ts";

/** The namespace of every feature file's ids (a fixed UUID: the plugin's own). */
const namespace = "8b1f3c2e-5d47-4a9e-9c61-2f0e7b4d6a13";

/** The ids of the feature file `uri`, in `language`, `content`: the n-th of them. */
const idsOf = (uri: string, language: string, content: string) => {
  const fileNamespace = v5(JSON.stringify([uri, language, content]), namespace);
  let next = 0;
  return () => v5(String(next++), fileNamespace);
};

/** The media type of the feature file `uri`, by its extension (`.md`: Gherkin in Markdown). */
export const mediaTypeOf = (content: string, uri: string) =>
  makeSourceEnvelope(content, uri).source?.mediaType ??
  SourceMediaType.TEXT_X_CUCUMBER_GHERKIN_PLAIN;

/** The plan of the feature file `uri` (its path from the project's root, with `/`), `content`. */
export const planOf = (
  content: string,
  uri: string,
  language: string,
): {
  featureTree: FeatureSuite;
  /** Its parse errors, as cucumber's Gherkin parser reports them. */
  parseErrors: string[];
  gherkin?: FeatureGherkin;
} => {
  const mediaType = mediaTypeOf(content, uri);
  let document: GherkinDocument | undefined;
  const pickles: Pickle[] = [];
  const parseErrors: string[] = [];
  for (const { gherkinDocument, pickle, parseError } of generateMessages(
    content,
    uri,
    mediaType,
    {
      defaultDialect: language,
      includeGherkinDocument: true,
      includePickles: true,
      newId: idsOf(uri, language, content),
    },
  )) {
    document ??= gherkinDocument;
    if (pickle) {
      pickles.push(pickle);
    }
    if (parseError) {
      parseErrors.push(parseError.message);
    }
  }
  return {
    featureTree: featureTree(uri, document, pickles),
    parseErrors,
    ...(document && { gherkin: { document, pickles } }),
  };
};
