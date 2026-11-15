export function getProductDescriptionBlocks(product) {
  const content = product.catalogContent;
  const description =
    content?.text || (product.descriptionIsFallback ? null : product.description);
  return {
    description,
    sections: [
      ['Конструкция', content?.construction],
      ['Где применяется', content?.application],
      ['Как выбрать', content?.selection],
    ].filter(([, text]) => typeof text === 'string' && text.trim()),
  };
}

export function getBuyerDesignation(decoded) {
  if (!decoded?.tokens?.length) return null;
  if (decoded.status === 'reviewed') return decoded;

  const tokens = decoded.tokens.filter(
    ({ code, text }) =>
      /^(?:нг|\d)/iu.test(code) &&
      !/уточня|не подтвержд|единицы и назначение/iu.test(text)
  );
  return tokens.length
    ? {
        ...decoded,
        tokens,
        description: '',
        manufacturerTexts: [],
        unknown: [],
        warnings: [],
      }
    : null;
}
