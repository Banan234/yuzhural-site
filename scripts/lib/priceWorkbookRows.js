// Preserve worksheet coordinates independently from legacy identity positions.
export function readPriceWorksheetRows(worksheet, xlsx, sheetName) {
  const range = xlsx.utils.decode_range(worksheet['!ref'] || 'A1');
  const rows = xlsx.utils.sheet_to_json(worksheet, {
    header: 1,
    blankrows: true,
    defval: '',
    raw: true,
    range: { s: { r: 0, c: 0 }, e: range.e },
  });
  let legacyIndex = 0;
  for (const row of rows) {
    Object.defineProperty(row, 'identityRowIndex', { value: legacyIndex });
    Object.defineProperty(row, 'sheetName', { value: sheetName });
    if (row.some((cell) => cell !== '' && cell != null)) legacyIndex++;
  }
  return rows;
}
