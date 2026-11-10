// Lexical explanation only. This does not establish a manufacturer's model,
// conductor material, installation rating or a documented size combination.
// Shield codes: Belden; category/pair/jacket notation: Paritet catalogue 2026.
export function explainLanNotation(value) {
  let rest = String(value || '').trim();
  const tokens = [];
  const sources = [];
  const take = (pattern, explain) => {
    rest = rest.replace(pattern, (...args) => {
      tokens.push({ code: args[0].trim(), text: explain(...args) });
      return ' ';
    });
  };
  take(
    /(?:cat[.\s-]*|кат[.\s-]*)([3-8](?:[eaеа])?)(?![\p{L}\p{N}_])/giu,
    (_, category) =>
      `Категория кабеля ${category.toUpperCase().replace('Е', 'E').replace('А', 'A')}; не является числом жил или сечением`
  );
  take(
    /(?<![\p{L}\p{N}_])([1-9]\d*)\s*(?:pr|p)(?![\p{L}\p{N}_])/giu,
    (_, count) => `Количество витых пар: ${count}`
  );
  take(
    /пар\s*([1-9]\d*)(?!\d)/giu,
    (_, count) => `Количество витых пар: ${count}`
  );
  take(
    /(?:AWG\s*(\d{2})(?:\/(\d+))?|(\d{2})(?:\/(\d+))?\s*AWG)(?!\d)/giu,
    (_, a, b, c, d) =>
      `Калибр проводника ${a || c} AWG${b || d ? `; число проволок в жиле: ${b || d}` : ''}; это не сечение в мм²`
  );
  const words = {
    PVC: 'Поливинилхлоридная оболочка (ПВХ)',
    PE: 'Полиэтиленовая оболочка',
    ZH: 'Оболочка из материала без галогенов',
    LSZH: 'Материал с низким дымовыделением, без галогенов',
    LS: 'Пониженное дымовыделение',
    FRNC: 'Материал, не распространяющий горение, без галогенов; не означает сохранение работоспособности при пожаре',
    SOLID: 'Однопроволочная жила',
    HF: 'Материал без галогенов; конкретный состав определяется исполнением',
    LAN: 'Локальная вычислительная сеть; указание назначения кабеля',
    OUTDOOR: 'В исходной маркировке указано наружное применение',
    БЕЛЫЙ: 'Цвет в исходной записи: белый',
  };
  take(
    /(?<![\p{L}\p{N}_])(LSZH|FRNC|SOLID|PVC|PE|ZH|LS|HF|LAN|OUTDOOR|БЕЛЫЙ)(?![\p{L}\p{N}_])/giu,
    (word) => words[word.toUpperCase()]
  );
  const labels = [
    [
      'NETLAN',
      'NETLAN — торговая марка, указанная в исходном названии; правообладатель — Тайле',
      'https://www.tayle.ru/NETLAN/',
    ],
    [
      'CAVEL',
      'CAVEL — обозначение марки в исходном названии',
      'https://catalogo.cavel.it/categoria-prodotto/cavi-lan/',
    ],
    [
      'PARLAN',
      'ParLan — марка сетевых кабелей завода Паритет',
      'https://paritet.su/upload/iblock/bd7/Paritet_catalog_2026.pdf#page=17',
    ],
    [
      'NIKOLAN NKL',
      'NIKOLAN — торговая марка; NKL — префикс обозначения изделий, не размер проводника',
      'https://nikomax.ru/resources/content/588/?view=true',
    ],
    [
      'REXANT',
      'REXANT — торговая марка, указанная в исходном названии',
      'https://cdn.vseinstrumenti.ru/instruction/nomenclaturecontent/202601/58537300.pdf/6791791_other.pdf',
    ],
    [
      'LANMASTER',
      'LANMASTER — торговая марка, указанная в исходном названии',
      'https://www.lanmaster.ru/',
    ],
  ];
  for (const [label, text, url] of labels) {
    const before = rest;
    take(
      new RegExp(
        `(?<![\\p{L}\\p{N}_])${label.replace(' ', '\\s+')}(?![\\p{L}\\p{N}_])`,
        'giu'
      ),
      () => text
    );
    if (before !== rest)
      sources.push({ title: `${label} — источник обозначения`, url });
  }
  const beforeFt4 = rest;
  take(
    /(?<![\p{L}\p{N}_])FT4(?![\p{L}\p{N}_])/giu,
    () =>
      'FT4 — обозначение испытания кабеля на распространение пламени по CSA; не означает сохранение работоспособности при пожаре'
  );
  if (beforeFt4 !== rest)
    sources.push({
      title: 'HELUKABEL — испытание CSA FT4',
      url: 'https://www.helu.com/helu/cz/dokumenty/short-katalog-helu.pdf#page=33',
    });
  const beforeNvp = rest;
  take(
    /(?<![\p{L}\p{N}_])NVP\s+(0[.,]\d+)(?![\p{L}\p{N}_])/giu,
    (_, value) =>
      `NVP — относительная скорость распространения сигнала; в исходной маркировке указано ${value.replace('.', ',')} от скорости света`
  );
  if (beforeNvp !== rest)
    sources.push({
      title: 'NIKOLAN — маркировка NVP',
      url: 'https://nikomax.ru/resources/content/588/?view=true#page=2',
    });
  if (tokens.length)
    sources.push({
      title: 'Паритет — обозначения сетевых кабелей',
      url: 'https://paritet.su/upload/iblock/bd7/Paritet_catalog_2026.pdf#page=17',
    });
  // Separators are consumed, never arbitrary numbers, brands or model suffixes.
  rest = rest
    .replace(/^[\s-]+|[\s-]+$/gu, '')
    .replace(/\s+/gu, ' ')
    .trim();
  return { tokens, unknown: rest, sources };
}
