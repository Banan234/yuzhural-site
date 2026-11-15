// The import fields also carry legacy parser values. Display units follow the
// reviewed designation, while the original fields still identify variants.
export function getCatalogDisplayDimensions(product) {
  const reviewed = product.designationDecoded?.status === 'reviewed';
  const tokens = reviewed ? product.designationDecoded.tokens || [] : [];
  const text = tokens.map((token) => token.text).join(' ');
  const source = product.sourceName || product.fullName || product.name || '';
  const optical =
    product.catalogSubcategorySlug === 'optovolokonnye-kabeli' ||
    tokens.some(({ text }) =>
      /(?:оптическ\p{L}* модул|оптическ\p{L}* волокон)/iu.test(text)
    );
  const lan =
    product.catalogSubcategorySlug === 'lan-kabeli' ||
    /^(?:[FSU]\/)?[FSU]?[FSU]?TP(?:\b|[- ])/iu.test(source);
  const awg = source.match(
    /(?:(?<!\d)(\d{1,2})\s*AWG\b|\bAWG\s*(\d{1,2})\b)/iu
  );
  const gauge = awg && Number(awg[1] ?? awg[2]);
  const numericDiameter = tokens
    .map(
      ({ code, text }) =>
        /[xх×]/iu.test(code) &&
        text.match(/диаметр\p{L}* (?:жил\p{L}* )?(\d+(?:[.,]\d+)?)\s*мм(?!²)/iu)
    )
    .find(Boolean);
  const diameter =
    numericDiameter && Number(numericDiameter[1].replace(',', '.'));
  const sameDiameter = diameter > 0 && diameter === product.crossSection;
  const pairCount =
    (product.groupCores === 2 &&
      /(?:\b\d+\s+пар(?:а|ы)?(?!\p{L})|количество пар\s*[:—])/iu.test(text)) ||
    (product.groupCores === 2 && lan) ||
    (lan && gauge && /[xх×]\s*2\s*$/iu.test(source));
  const size = source.match(/(?:^|\D)(\d+)\s*[xх×]\s*2\s*$/iu);
  if (optical) {
    const fiber = tokens
      .filter(({ code }) => !/[xх×]/iu.test(code))
      .map(({ text }) =>
        text.match(/(?:^|\s)(\d+)\s+(?:оптических\s+)?волок(?:он|н)\p{L}*/iu)
      )
      .find(Boolean);
    const modules = tokens
      .map(
        ({ code, text }) =>
          /оптическ\p{L}* модул/iu.test(text) &&
          code.match(/^(\d+)\s*[xх×]\s*(\d+)$/iu)
      )
      .find(Boolean);
    return {
      kind: 'optical',
      ...(fiber && { fibers: Number(fiber[1]) }),
      ...(modules &&
        fiber &&
        Number(modules[1]) * Number(modules[2]) === Number(fiber[1]) && {
          modules: Number(modules[1]),
          fibersPerModule: Number(modules[2]),
        }),
    };
  }
  const documentedPairs =
    lan &&
    tokens.find(({ code, text }) => {
      const count = code.match(/^(\d+)×2$/u)?.[1];
      return count && text.startsWith(`Количество пар: ${count}.`);
    });
  if (!gauge && !sameDiameter && documentedPairs) {
    return { kind: 'pairs', pairs: Number(documentedPairs.code.split('×')[0]) };
  }
  if (sameDiameter || (lan && gauge) || pairCount) {
    return {
      kind: lan && gauge ? 'awg' : sameDiameter ? 'diameter' : 'area',
      ...(sameDiameter && { diameter }),
      ...(lan && gauge && { gauge }),
      ...(pairCount && { pairs: size ? Number(size[1]) : product.cores }),
    };
  }
  return null;
}
