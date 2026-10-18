import register from './manufacturerTexts.json' with { type: 'json' };

// Identity includes the source section. Equal wording from different factories
// is still separate evidence. Changed wording is a new retained version.
export function mergeManufacturerTexts(existing, additions) {
  const records = new Map(existing.map((record) => [record.id, record]));
  for (const record of additions) {
    const previous = records.get(record.id);
    if (previous && JSON.stringify(previous) !== JSON.stringify(record))
      throw new Error(`Новая версия должна иметь новый ID: ${record.id}`);
    if (!previous) records.set(record.id, record);
  }
  return [...records.values()];
}

export function selectManufacturerTexts(
  familyId,
  executionCodes,
  documents,
  records = register.records
) {
  if (!familyId) return [];
  return records.flatMap((record) => {
    if (!record.familyIds.includes(familyId)) return [];
    if (
      record.excludedFirePattern &&
      executionCodes.some((code) =>
        new RegExp(record.excludedFirePattern, 'u').test(code)
      )
    )
      return [];
    if (
      record.firePattern &&
      !executionCodes.some((code) =>
        new RegExp(record.firePattern, 'u').test(code)
      )
    )
      return [];
    const document = documents.find((item) => item.id === record.documentId);
    if (
      document?.status !== 'collected' ||
      document.publisherType !== 'manufacturer' ||
      document.sha256 !== record.sourceSha256
    )
      return [];
    const url = record.pages.length
      ? `${document.url.split('#')[0]}#page=${record.pages[0]}`
      : document.url;
    return [{ ...record, sourceTitle: document.title, url }];
  });
}
