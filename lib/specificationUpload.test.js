import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import XLSX from '@e965/xlsx';
import { createApp } from '../server';
import { startTestServer, closeTestServer } from '../src/test/startTestServer';
import { MAX_SPECIFICATION_FILE_BYTES } from '../shared/specificationFiles';
import { PERSONAL_DATA_CONSENT_VERSION } from '../shared/personalDataConsent';
const sendMail = vi.fn().mockResolvedValue({ messageId: 'spec-test' });
const payload = {
  customer: {
    name: 'Тестовая заявка',
    phone: '+79001234567',
    email: '',
    consent: true,
    consentVersion: PERSONAL_DATA_CONSENT_VERSION,
    preferredChannel: 'phone',
    comment: 'ВВГ 3х2,5, 200 м',
  },
  items: [],
  totalCount: 0,
  totalPrice: 0,
  createdAt: '14.10.2026',
  rendered_at: Date.now() - 5000,
  submit_at: Date.now(),
  company_website: '',
};
let server, baseUrl;
beforeAll(async () => {
  const started = await startTestServer(
    createApp({
      env: {
        NODE_ENV: 'test',
        FORMS_ENABLED: 'true',
        SMTP_HOST: 'smtp.example.test',
        SMTP_PORT: '465',
        SMTP_USER: 'test@example.test',
        SMTP_PASS: 'fake',
        SMTP_FROM: 'test@example.test',
        QUOTE_TO_EMAIL: 'sales@example.test',
      },
      mailTransporter: { sendMail },
      formResponseDelayRange: { min: 0, max: 0 },
      quoteRateLimitOptions: { limit: 100 },
    })
  );
  server = started.server;
  baseUrl = started.baseUrl;
});
afterAll(() => closeTestServer(server));
beforeEach(() => sendMail.mockClear());
async function post(files, body = payload) {
  const data = new FormData();
  data.append('payload', JSON.stringify(body));
  for (const [name, content] of files)
    data.append('specifications', new Blob([content]), name);
  return fetch(`${baseUrl}/api/quote`, { method: 'POST', body: data });
}
describe('multipart quote', () => {
  it('принимает ровно три вложения', async () => {
    const response = await post([
      ['1.pdf', '%PDF-1.4'],
      ['2.pdf', '%PDF-1.4'],
      ['3.pdf', '%PDF-1.4'],
    ]);
    expect(response.status).toBe(200);
    expect(sendMail.mock.calls[0][0].attachments).toHaveLength(3);
  });
  it('принимает файл ровно 5 МиБ', async () => {
    const bytes = Buffer.alloc(MAX_SPECIFICATION_FILE_BYTES);
    bytes.write('%PDF-1.4');
    const response = await post([['limit.pdf', bytes]]);
    expect(response.status).toBe(200);
    expect(sendMail.mock.calls[0][0].attachments[0].content.length).toBe(
      MAX_SPECIFICATION_FILE_BYTES
    );
  });
  it('передаёт спецификацию как настоящее вложение без фиктивного товара', async () => {
    const content = Buffer.from('%PDF-1.4\nTest specification\n%%EOF');
    const response = await post([['спецификация.pdf', content]]);
    expect(response.status).toBe(200);
    expect(sendMail).toHaveBeenCalledTimes(1);
    const mail = sendMail.mock.calls[0][0];
    expect(mail.attachments[0].filename).toBe('спецификация.pdf');
    expect(mail.attachments[0].content.equals(content)).toBe(true);
    expect(mail.html).toContain('Спецификации');
    expect(mail.html).toContain('спецификация.pdf');
  });
  it('принимает реальный XLSX, а не произвольный ZIP', async () => {
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(
      book,
      XLSX.utils.aoa_to_sheet([
        ['Марка', 'Метры'],
        ['ВВГ 3х2,5', 200],
      ]),
      'Заявка'
    );
    const response = await post([
      ['заявка.xlsx', XLSX.write(book, { type: 'buffer', bookType: 'xlsx' })],
    ]);
    expect(response.status).toBe(200);
    expect(sendMail.mock.calls[0][0].attachments[0].contentType).toContain(
      'spreadsheetml'
    );
  });
  it('сохраняет валидацию согласия и пустой заявки', async () => {
    expect(
      (
        await post([['заявка.pdf', '%PDF-1.4 test']], {
          ...payload,
          customer: { ...payload.customer, consent: false },
        })
      ).status
    ).toBe(400);
    expect((await post([])).status).toBe(400);
    expect(sendMail).not.toHaveBeenCalled();
  });
  it('отклоняет другой тип, несоответствующую сигнатуру, слишком большой файл и лишние файлы', async () => {
    for (const files of [
      [['script.exe', 'x']],
      [['fake.pdf', 'not a pdf']],
      [['fake.xlsx', Buffer.from('504b030400000000', 'hex')]],
      [['big.pdf', Buffer.alloc(MAX_SPECIFICATION_FILE_BYTES + 1)]],
      [
        ['1.pdf', '%PDF-1.4'],
        ['2.pdf', '%PDF-1.4'],
        ['3.pdf', '%PDF-1.4'],
        ['4.pdf', '%PDF-1.4'],
      ],
    ]) {
      const response = await post(files);
      expect([400, 413]).toContain(response.status);
      expect((await response.json()).ok).toBe(false);
    }
    expect(sendMail).not.toHaveBeenCalled();
  });
});
