import multer from 'multer';
import {
  MAX_SPECIFICATION_FILES,
  MAX_SPECIFICATION_FILE_BYTES,
} from '../shared/specificationFiles.js';
import { MAX_QUOTE_PAYLOAD_BYTES } from '../shared/quoteValidation.js';

const parse = multer({
  storage: multer.memoryStorage(),
  defParamCharset: 'utf8',
  limits: {
    fileSize: MAX_SPECIFICATION_FILE_BYTES + 1,
    files: MAX_SPECIFICATION_FILES,
    fields: 1,
    parts: MAX_SPECIFICATION_FILES + 2,
    fieldSize: MAX_QUOTE_PAYLOAD_BYTES,
    fieldNameSize: 40,
    headerPairs: 50,
  },
  fileFilter(req, file, cb) {
    cb(
      /\.(pdf|xlsx?)$/i.test(file.originalname)
        ? null
        : new Error('Формат файла: PDF, XLS или XLSX.'),
      true
    );
  },
}).array('specifications', MAX_SPECIFICATION_FILES);

// Проверяем оглавление ZIP без распаковки XML. Обычный ZIP, макросы и
// зашифрованные файлы не принимаются как XLSX.
function isXlsx(bytes) {
  if (bytes.length < 22 || bytes.readUInt32LE(0) !== 0x04034b50) return false;
  let end = -1;
  for (
    let offset = bytes.length - 22;
    offset >= Math.max(0, bytes.length - 65557);
    offset--
  ) {
    if (
      bytes.readUInt32LE(offset) === 0x06054b50 &&
      offset + 22 + bytes.readUInt16LE(offset + 20) === bytes.length
    ) {
      end = offset;
      break;
    }
  }
  if (
    end < 0 ||
    bytes.readUInt16LE(end + 4) !== 0 ||
    bytes.readUInt16LE(end + 6) !== 0
  )
    return false;
  const entries = bytes.readUInt16LE(end + 10);
  const directorySize = bytes.readUInt32LE(end + 12);
  let offset = bytes.readUInt32LE(end + 16);
  const directoryEnd = offset + directorySize;
  if (
    !entries ||
    entries > 1000 ||
    bytes.readUInt16LE(end + 8) !== entries ||
    directoryEnd > end
  )
    return false;
  const names = new Set();
  let expanded = 0;
  for (let i = 0; i < entries; i++) {
    if (
      offset + 46 > directoryEnd ||
      bytes.readUInt32LE(offset) !== 0x02014b50 ||
      bytes.readUInt16LE(offset + 8) & 1
    )
      return false;
    const nameLength = bytes.readUInt16LE(offset + 28);
    const next =
      offset +
      46 +
      nameLength +
      bytes.readUInt16LE(offset + 30) +
      bytes.readUInt16LE(offset + 32);
    if (next > directoryEnd) return false;
    const name = bytes
      .subarray(offset + 46, offset + 46 + nameLength)
      .toString('utf8');
    if (/\.bin$/i.test(name)) return false;
    expanded += bytes.readUInt32LE(offset + 24);
    if (expanded > 50 * 1024 * 1024) return false;
    names.add(name);
    offset = next;
  }
  return (
    offset === directoryEnd &&
    names.has('[Content_Types].xml') &&
    names.has('xl/workbook.xml')
  );
}

export function specificationAttachments(files = []) {
  return files.map((file) => {
    const filename = file.originalname
      .replace(/[\\/\x00-\x1f\x7f]/g, '_')
      .slice(-160);
    const extension = filename.split('.').pop().toLowerCase();
    const bytes = file.buffer;
    const matches =
      extension === 'pdf'
        ? bytes.subarray(0, 5).toString() === '%PDF-'
        : extension === 'xls'
          ? bytes.subarray(0, 8).equals(Buffer.from('d0cf11e0a1b11ae1', 'hex'))
          : extension === 'xlsx' && isXlsx(bytes);
    if (
      !bytes.length ||
      bytes.length > MAX_SPECIFICATION_FILE_BYTES ||
      !matches
    )
      throw new Error(
        'Содержимое файла не соответствует формату PDF, XLS или XLSX.'
      );
    return {
      filename,
      content: bytes,
      contentType: {
        pdf: 'application/pdf',
        xls: 'application/vnd.ms-excel',
        xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      }[extension],
    };
  });
}

// Принимаем только одно поле payload и ограниченные вложения на маршруте КП.
export function parseQuoteSubmission(req, res, next) {
  if (!req.is('multipart/form-data')) return next();
  parse(req, res, (error) => {
    if (error)
      return res.status(error.code === 'LIMIT_FILE_SIZE' ? 413 : 400).json({
        ok: false,
        message: error.code
          ? 'PDF/XLS/XLSX: до 3 файлов по 5 МБ; текст заявки до 64 КБ.'
          : error.message,
      });
    try {
      if (typeof req.body?.payload !== 'string')
        throw new Error('Не удалось прочитать заявку.');
      req.body = JSON.parse(req.body.payload);
      if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body))
        throw new Error('Не удалось прочитать заявку.');
      req.specificationAttachments = specificationAttachments(req.files);
      next();
    } catch (err) {
      res.status(400).json({
        ok: false,
        message:
          err instanceof SyntaxError
            ? 'Не удалось прочитать заявку.'
            : err.message,
      });
    }
  });
}
export function requireQuoteContentType(req, res, next) {
  if (req.is('application/json') || req.is('multipart/form-data'))
    return next();
  return res
    .status(415)
    .json({ ok: false, message: 'Используйте JSON или multipart/form-data.' });
}
