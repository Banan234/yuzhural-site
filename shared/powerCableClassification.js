// Подкатегории силовых кабелей: одна позиция — одна основная группа.
// Бумажная изоляция имеет приоритет над бронёй; затем броня и материал изоляции.

export function normalizePowerCableMark(value) {
  return String(value || '')
    .toLocaleUpperCase('ru-RU')
    .replace(/[\s_]/gu, '')
    .replace(/^ИНСИЛ-?/u, '')
    .replace(/^КУГ(?=ППГ)/u, '');
}

// Только подтверждённые силовые резиновые серии из общей категории гибких
// кабелей. КГВВ, КГПП, РПШ, РКГМ и судовые серии сюда не переносятся.
const FLEXIBLE_RUBBER_POWER_MARK =
  /^(?:АС)?(?:КГ(?:Н|РР|ТКО|Ш|ХЛ)?|КОГ(?:1)?|КГТП)(?:$|[-(])/u;

export function isFlexibleRubberPowerCable(product = {}) {
  return FLEXIBLE_RUBBER_POWER_MARK.test(
    normalizePowerCableMark(product.mark || product.markFamily)
  );
}

export function getPowerCableSubcategorySlug(product = {}) {
  const mark = normalizePowerCableMark(product.mark || product.markFamily);
  const designation = normalizePowerCableMark(product.name || product.fullName);

  // В прайсе эти ПБПнг — бронированные силовые кабели, несмотря на
  // ошибочную исходную рубрику «Провод». ПБПЭ здесь не классифицируется.
  if (mark === 'ПБП' && /^ПБПНГ\(А\)-(?:FR)?HF/u.test(designation)) {
    return 'silovoy-kabel-bronirovannyy';
  }

  // Бумажная изоляция: броня этих серий не переводит их в группу ПВХ/СПЭ.
  if (/^(?:Ц)?(?:АА(?:Б|С|Ш)|АС(?:Б|Г|Ш)|С(?:Б|Г|Ш))/u.test(mark)) {
    return 'silovoy-kabel-bumazhnaya-izolyaciya';
  }

  // Броня проверяется по конструкции семейства, а не по любой букве Б.
  if (
    /^(?:А?(?:ВБ|ВКБ|ВЭБ|ПВ(?:Э)?Б)|КГЛВБ|(?:КА?9)(?:РВ|СПВ)(?:СБ|СК|АБ|АК)|MEDIASTRIP(?:LV)?B)/u.test(
      mark
    )
  ) {
    return 'silovoy-kabel-bronirovannyy';
  }

  if (
    isFlexibleRubberPowerCable(product) ||
    /^(?:А?ВРГ|НРГ|КПГ(?:Н|Э)?\d?У|EPR-F|MEDIASTRIP(?:LV)?H|КА?9РВ)/u.test(mark)
  ) {
    return 'silovoy-kabel-rezinovaya-izolyaciya';
  }

  // ППГ — безгалогенные композиции, а не СПЭ, несмотря на старую группу прайса.
  if (/^А?ПП(?:Г|Э)/u.test(mark)) {
    return 'silovoy-kabel-polimernye-kompozicii';
  }

  if (/^(?:А?ПВ|КА?9СПВ|N2X|N2H)/u.test(mark)) {
    return 'silovoy-kabel-spe';
  }

  if (/^(?:А?ВВ|АСВВГ|ВКВ|NYM|NYY|NUM|NYC|NYR|PVC|КУСИЛ|КПВП)/u.test(mark)) {
    return 'silovoy-kabel-pvh';
  }

  // Неизвестную новую марку нельзя автоматически объявлять кабелем с ПВХ.
  return '';
}
