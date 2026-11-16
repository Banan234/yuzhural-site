import fs from 'node:fs/promises';
import path from 'node:path';

export const catalogCableSpecs = {
  'Материал жилы': 'Медь',
  'Конструкция токопроводящей жилы': 'Однопроволочная',
  'Форма токопроводящей жилы': 'Круглая',
  'Форма кабеля': 'Круглый',
  'Материал изоляции': 'ПВХ',
  'Наружная оболочка': 'Да',
  'Материал оболочки': 'ПВХ',
  'Экранированный': 'Нет',
  'Бронированный': 'Нет',
  'Заполнение сердечника': 'Нет',
  'Внутренняя оболочка': 'Нет',
  'Огнестойкий барьер': 'Нет',
  'Дренажный проводник': 'Нет',
  'Разделительный слой': 'Нет',
};

export async function writeCatalogImageFixture(root, products) {
  const directory = path.join(root, 'data/catalog-current');
  await fs.mkdir(directory, { recursive: true });
  await fs.writeFile(path.join(directory, 'products.json'), JSON.stringify(products));
}
