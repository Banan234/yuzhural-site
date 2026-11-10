import XLSX from '@e965/xlsx';
import { SITE_EMAIL } from '../../src/lib/siteConfig.js';

// Preserve the supplier source for import hashes; update only the public copy.
export function publicPriceContacts(buffer) {
  const previous = ['kabelhome@mail.ru', 'kabelh@bk.ru'];
  if (
    !previous.some(
      (email) =>
        buffer.includes(Buffer.from(email)) ||
        buffer.includes(Buffer.from(email, 'utf16le'))
    )
  )
    return buffer;
  const workbook = XLSX.read(Buffer.from(buffer), {
    type: 'buffer',
    cellStyles: true,
  });
  for (const sheet of Object.values(workbook.Sheets)) {
    for (const [address, cell] of Object.entries(sheet)) {
      if (address.startsWith('!') || typeof cell.v !== 'string') continue;
      const value = previous.reduce(
        (text, email) => text.replaceAll(email, SITE_EMAIL),
        cell.v
      );
      if (value !== cell.v) {
        cell.v = value;
        delete cell.w;
        if (cell.l?.Target)
          cell.l.Target = previous.reduce(
            (text, email) => text.replaceAll(email, SITE_EMAIL),
            cell.l.Target
          );
      }
    }
  }
  return XLSX.write(workbook, {
    type: 'buffer',
    bookType: 'biff8',
    cellStyles: true,
  });
}
