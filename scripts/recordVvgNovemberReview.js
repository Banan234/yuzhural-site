import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { digest, recordCableStyleReview } from './lib/cableStyleBatch.js';
import { loadCableReviewDecisions } from './lib/cableReviewDecisions.js';

const root = fileURLToPath(new URL('..', import.meta.url));
const oldBatch = 'outputs/cable-vvg-typical-2026-11-15/drafts';
const revisions = 'outputs/cable-vvg-cut-revisions-2026-11-15';
const read = async file => JSON.parse(await fs.readFile(path.join(root, file)));
const inputs = [
  ['YU-0000757', 'ВВГнг(А)-FRLS 1х1.5', oldBatch, '7414d', '5769fcfa4cfc7639a7985eb6feb420ecb1a49a239f13be0cd84834127722cfba', 'NEEDS_CORRECTION', 'Лишняя визуальная ступень. Сохранить подтверждённую внутреннюю оболочку, изоляцию и слюдяной барьер; исключить лишний слой и сохранить геометрию.'],
  ['YU-0000879', 'ВВГэнг(А)-LS 2х1.5', oldBatch, '95d65', '174e13bd1b706552552cd0f1fe47ec4679c7901fba51f7a4312220863549db1c', 'NEEDS_CORRECTION', 'Слишком длинные участки индивидуальной изоляции относительно экрана и оболочки. Состав конструкции сохранить.'],
  ['YU-0000917', 'ВВГэнг(А)-LS 3х2.5', oldBatch, '4046b', 'bd892366c310baceaa51025b3ef2044c6718d212bed7cb517872bdf9eb37d925', 'NEEDS_CORRECTION', 'Слишком длинная зачистка до металла относительно экрана и оболочки. Состав конструкции сохранить.'],
  ['YU-0000920', 'ВВГзнг(А) 3х4', revisions, 'YU-0000920', '1b81a6205ecf6d2fc5a6f5902a4727a524fc9d9fde6992ebecf7cf1a35944e47', 'REJECT', 'Неверная укладка жил, заполнение выступает за границу среза.'],
  ['YU-0000777', 'ВВГз 2х6', revisions, 'YU-0000777', '1139e1147810b4e609c1a9bd2972a65df642d1b156dd9421f2a32967639841d2', 'REJECT', 'Заполнение выступает за плоскость среза. Исходный PNG сохраняется.'],
  ['YU-0000982', 'ВВГэнг 4х1', oldBatch, '61248', '60758f923c8d2f84825f84aed007b769cfa2bfd22bdb9c6946bd1d91af2fc65a', 'REJECT', 'Неверная компоновка четырёх жил. Запрещён как положительный референс.'],
  ['YU-0001159', 'ВВГэнг(А)-LS 5х4', oldBatch, '47791', '7fd07ac3778e94bcd1702df45dc547fca4060bc679fb230f7fd00875f0acec3c', 'NEEDS_CORRECTION', 'Слишком длинные и неравномерно расположенные участки изоляции. Состав конструкции сохранить.'],
];
const products = new Map((await read('data/catalog-current/products.json')).map(product => [product.sku, product]));
const archived = new Map((await loadCableReviewDecisions(root)).map(row => [row.decision.sha256, row]));
const outcomes = [];
for (const [sku, name, parent, prefix, sha256, disposition, note] of inputs) {
  try {
    assert.equal(products.get(sku)?.name, name);
    const names = (await fs.readdir(path.join(root, parent))).filter(name => name.startsWith(prefix));
    assert.equal(names.length, 1, 'Ambiguous draft directory');
    const source = path.join(parent, names[0]);
    const group = await read(path.join(source, 'group.json'));
    assert.ok(group.members.some(member => member.sku === sku && (!member.name || member.name === name)));
    const request = await read(path.join(source, 'request.json'));
    assert.equal(digest(group.profile), digest(request.profile));
    assert.equal(digest(await fs.readFile(path.join(root, source, 'image.png'))), sha256);
    const previous = archived.get(sha256);
    if (previous?.decision.status === 'APPROVED') throw Error('Existing approval must be preserved');
    const draftDir = previous?.decisionDir ?? path.join(root, source);
    const decision = { sha256, sku, disposition, note, reviewer: 'Пользователь · решения по партии ВВГ',
      status: disposition === 'REJECT' ? 'REJECTED' : 'NEEDS_REVIEW' };
    const record = await recordCableStyleReview({ root, draftDir, decision, verifyOnly: !process.argv.includes('--apply') });
    outcomes.push({ sku, name, source, ...record });
  } catch (error) {
    outcomes.push({ sku, name, sha256, status: 'CONFLICT', reason: error.message });
  }
}
const sku = 'YU-0001039';
const candidates = [
  [revisions + '/' + sku, 'REJECTED'],
  ['outputs/cable-vvg-new-2026-11-15/ea4018c0e46c573c6610b204e9744026aee0f790f3a3f01d163dac820433345d', 'HELD_DEFECT'],
];
outcomes.push({ sku, name: products.get(sku)?.name, status: 'CONFLICT',
  reason: 'Две версии с несовместимыми предыдущими решениями. Пользователь не указал файл или SHA удачного PNG.',
  candidates: await Promise.all(candidates.map(async ([source, status]) => ({
    source, status, sha256: digest(await fs.readFile(path.join(root, source, 'image.png'))),
  }))),
});
console.log(JSON.stringify(outcomes, null, 2));
