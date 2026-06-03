import { generateMessages } from "@cucumber/gherkin";
import type { Pickle } from "@cucumber/messages";
import { IdGenerator, SourceMediaType } from "@cucumber/messages";
import { Query } from "@cucumber/query";

export type ParsedFeature = ReturnType<typeof parseFeature>;

export const getScenarioKey = ({
  query,
  pickle,
}: {
  query: Query;
  pickle: Pickle;
}): string => {
  const lineage = query.findLineageBy(pickle);
  const scenarioLine = lineage?.scenario?.location.line;
  const exampleLine = lineage?.example?.location.line;

  return `${scenarioLine}:${exampleLine}`;
};

export const parseFeature = async (content: string, uri = "") => {
  const newId = IdGenerator.uuid();
  const query = new Query();
  let featureName = "Feature";
  const parseErrors: string[] = [];

  for (const envelope of generateMessages(
    content,
    uri,
    SourceMediaType.TEXT_X_CUCUMBER_GHERKIN_PLAIN,
    {
      includeGherkinDocument: true,
      includePickles: true,
      newId,
    },
  )) {
    query.update(envelope);
    if (envelope.parseError) {
      const { source, message: msg } = envelope.parseError;
      parseErrors.push(`Parse error in "${source.uri}" ${msg}`);
    }
    if (envelope.gherkinDocument) {
      featureName = envelope.gherkinDocument.feature?.name || "Feature";
    }
  }

  if (parseErrors.length > 0) {
    throw new Error(`Parse failure\n${parseErrors.join("\n")}`);
  }

  // Deduplicate names: when two pickles share the same name, append " (2)", " (3)", …
  // The runner mirrors this counter so both sides assign the same unique key.

  const pickles = query.findAllPickles().map((pickle) => {
    const key = getScenarioKey({ query, pickle });
    const name = pickle.name;
    const lineage = query.findLineageBy(pickle);
    return { key, name, lineage };
  });

  return { featureName, pickles };
};
