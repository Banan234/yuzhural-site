import { expect, it } from 'vitest';
import { getProductReferenceSpecs } from './productReferenceSpecs.js';
const decode = (...texts) => Object.fromEntries(getProductReferenceSpecs({ designationDecoded: { tokens: texts.map(text => ({ text })) } }).map(x => [x.label, x.value]));
it('uses explicit decoded materials and protection', () => {
  expect(decode('Алюминиевые токопроводящие жилы', 'Изоляция из сшитого полиэтилена', 'Броня из стальных лент', 'Общий экран из медных лент')).toEqual({ 'Материал жилы': 'Алюминий', 'Материал изоляции': 'Сшитый полиэтилен', 'Бронированный': 'Да', 'Экранированный': 'Да' });
});
it('does not turn missing or uncertain protection into yes/no', () => {
  expect(decode('Без подушки под бронёй', 'Изоляцию, экран и броню определяют по полному исполнению')).toEqual({});
  expect(decode('Без брони и защитного покрова', 'Неэкранированная витая пара')).toEqual({ 'Бронированный': 'Нет', 'Экранированный': 'Нет' });
});
