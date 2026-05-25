import { generateMessages } from "@cucumber/gherkin";
import { IdGenerator, SourceMediaType } from "@cucumber/messages";
import { Query } from "@cucumber/query";

export type ParsedFeature = ReturnType<typeof parseFeature>;

export const parseFeature = (content: string, uri = "") => {
  const newId = IdGenerator.uuid();
  const query = new Query();
  let featureName = "Feature";

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
    if (envelope.gherkinDocument) {
      featureName = envelope.gherkinDocument.feature?.name || "Feature";
    }
    query.update(envelope);
  }

  // Deduplicate names: when two pickles share the same name, append " (2)", " (3)", …
  // The runner mirrors this counter so both sides assign the same unique key.
  const nameCount = new Map<string, number>();
  const scenarios = query.findAllPickles().map((pickle) => {
    const lineage = query.findLineageBy(pickle);
    const ruleName = lineage?.rule?.name ?? null;
    // example.location.line is the specific example row; falls back to the scenario line.
    const line =
      lineage?.example?.location?.line ??
      lineage?.scenario?.location?.line ??
      1;
    const count = (nameCount.get(pickle.name) ?? 0) + 1;
    nameCount.set(pickle.name, count);
    const name = count === 1 ? pickle.name : `${pickle.name} (${count})`;
    return { name, ruleName, line };
  });

  return { featureName, scenarios };
};
