// The list uses the same decoded reference as the detail page; unknowns stay absent.
export function getProductReferenceSpecs(product) {
  const values = new Map();
  const labels = ['Материал жилы', 'Материал изоляции', 'Изоляция', 'Бронированный', 'Броня', 'Экран', 'Экранированный'];
  for (const label of labels) {
    const value = product.specs?.[label];
    if (value != null && String(value).trim()) values.set(label, String(value));
  }
  const tokens = product.designationDecoded?.tokens || [];
  const texts = tokens.flatMap(({ text }) => String(text || '').split(';').map(s => s.trim()));
  const set = (label, value) => { if (!values.has(label)) values.set(label, value); };
  for (const text of texts) {
    if (/алюминиев\S* (?:токопроводящ\S* )?жил/i.test(text)) set('Материал жилы', 'Алюминий');
    if (/медн\S* (?:токопроводящ\S* |многопроволочн\S* )?жил/i.test(text)) set('Материал жилы', 'Медь');
    if (/изоляци/i.test(text) && !/уточн|определяют|по заказ|или|либо/i.test(text)) {
      if (/ПВХ/i.test(text)) set('Материал изоляции', 'ПВХ');
      else if (/сшит\S* полиэтилен/i.test(text)) set('Материал изоляции', 'Сшитый полиэтилен');
      else if (/полиэтилен/i.test(text)) set('Материал изоляции', 'Полиэтилен');
      else if (/силикон|кремнийорганическ/i.test(text)) set('Материал изоляции', 'Силикон');
      else if (/резин/i.test(text)) set('Материал изоляции', 'Резина');
      else if (/фторопласт/i.test(text)) set('Материал изоляции', 'Фторопласт');
      else if (/бумаж/i.test(text)) set('Материал изоляции', 'Бумага');
      else if (/полимер/i.test(text)) set('Материал изоляции', 'Полимер');
    }
    if (/без брони|небронирован|броня отсутствует/i.test(text)) set('Бронированный', 'Нет');
    else if (/броня|бронированн/i.test(text) && !/без подушки|определяют|уточн|или|либо/i.test(text)) set('Бронированный', 'Да');
    if (/неэкранирован|общий экран и экраны отдельных пар отсутствуют|без экранов?$/i.test(text)) set('Экранированный', 'Нет');
    else if (/экран|экранирующ/i.test(text) && !/отсутств|без экран|определяют|неэкранир|сечение|уточняются|уточняют наличие/i.test(text)) set('Экранированный', 'Да');
  }
  for (const [source, target] of [['Броня', 'Бронированный'], ['Экран', 'Экранированный']]) {
    if (values.has(source)) {
      const value = values.get(source).trim();
      if (/^(нет|без брони|без экрана|отсутствует|false)$/i.test(value)) values.set(target, 'Нет');
      else if (!/уточн|неизвест|не указан/i.test(value)) values.set(target, 'Да');
      values.delete(source);
    }
  }
  return [...values].map(([label, value]) => ({ label, value }));
}
