import { isProductPending } from '../shared/productAvailability.js';
import { profiles } from './catalogFamilyProfiles.js';
import { additionalProfiles } from './catalogFamilyAdditional.js';

const materials = new Map([
  ['ПВХ', 'ПВХ-пластикат'],
  ['ПВХ-пластикат', 'ПВХ-пластикат'],
  ['Полиэтилен', 'Полиэтилен'],
  ['Резина', 'Резина'],
  ['Сшитый полиэтилен (XLPE)', 'Сшитый полиэтилен'],
]);
const layers = {
  Изоляция: ['Материал изоляции'],
  Оболочка: ['Материал оболочки'],
  'Изоляция и оболочка': ['Материал изоляции', 'Материал оболочки'],
};
const metals = new Map([
  ['Медные жилы', 'Медь'],
  ['Медные токопроводящие жилы', 'Медь'],
  ['Медные многопроволочные жилы', 'Медь'],
  ['Медные однопроволочные жилы', 'Медь'],
  ['Алюминиевые токопроводящие жилы', 'Алюминий'],
  ['Алюминиевые жилы', 'Алюминий'],
]);
// Exact descriptions only. Names of layers in the token text disambiguate
// letters that have different meanings in different cable families.
const explicitLayers = new Map([
  ['ПВХ-изоляция', ['Изоляция', 'ПВХ-пластикат']],
  ['ПВХ изоляция', ['Изоляция', 'ПВХ-пластикат']],
  ['Изоляция из ПВХ', ['Изоляция', 'ПВХ-пластикат']],
  ['Изоляция из ПВХ-пластиката', ['Изоляция', 'ПВХ-пластикат']],
  ['Изоляция из поливинилхлоридного пластиката', ['Изоляция', 'ПВХ-пластикат']],
  ['ПВХ-оболочка', ['Оболочка', 'ПВХ-пластикат']],
  ['ПВХ оболочка', ['Оболочка', 'ПВХ-пластикат']],
  ['Оболочка из ПВХ', ['Оболочка', 'ПВХ-пластикат']],
  ['Наружная оболочка из ПВХ-пластиката', ['Оболочка', 'ПВХ-пластикат']],
  ['Защитная оболочка из ПВХ', ['Оболочка', 'ПВХ-пластикат']],
  ['ПВХ изоляция и оболочка', ['Изоляция и оболочка', 'ПВХ-пластикат']],
  ['ПВХ-изоляция и оболочка', ['Изоляция и оболочка', 'ПВХ-пластикат']],
  ['Полиэтиленовая изоляция', ['Изоляция', 'Полиэтилен']],
  ['Полиэтиленовая оболочка', ['Оболочка', 'Полиэтилен']],
  ['Изоляция из сшитого полиэтилена', ['Изоляция', 'Сшитый полиэтилен']],
  ['Резиновая изоляция', ['Изоляция', 'Резина']],
  ['Резиновая оболочка', ['Оболочка', 'Резина']],
]);
const explicitArmor = new Map([
  [
    'Броня из стальных оцинкованных проволок',
    'Стальные оцинкованные проволоки',
  ],
  ['Броня из стальных лент', 'Стальные ленты'],
  ['Броня из стальных оцинкованных лент', 'Стальные оцинкованные ленты'],
  [
    'Броня из ламинированной гофрированной стальной ленты',
    'Ламинированная гофрированная стальная лента',
  ],
]);
const explicitScreens = new Set([
  'Общий экран из алюмофлекса с медной лужёной дренажной жилой',
  'Общий экран из алюмополимерной ленты',
  'Общий экран из фольги и проволочной оплётки',
  'Общий экран из алюминиевой фольги и оплётки из медных лужёных проволок',
  'Общий экран из медных лужёных проволок',
  'Экран из медных лужёных проволок',
  'Общий экран: Фольгированный композиционный материал',
]);
const moreMetals = new Map([
  ['Медная жила', 'Медь'],
  ['Медная токопроводящая жила', 'Медь'],
  ['Медные однопроволочные', 'Медь'],
  ['Однопроволочные медные', 'Медь'],
  ['Медные многопроволочные', 'Медь'],
  ['Алюминиевая жила', 'Алюминий'],
]);

const supplementaryFacts = new Map([
  ['Изоляция|Сплошной полиэтилен', ['Материал изоляции', 'Полиэтилен']],
  [
    'Изоляция|Полиэтилен физического вспенивания',
    ['Материал изоляции', 'Вспененный полиэтилен'],
  ],
  [
    'Оболочка|Полимерная композиция, не содержащая галогенов',
    ['Материал оболочки', 'Безгалогенная полимерная композиция'],
  ],
  [
    'Оболочка|Полимерная композиция без галогенов, чёрная',
    ['Материал оболочки', 'Безгалогенная полимерная композиция'],
  ],
  [
    'Жилы|Медные многопроволочные жилы; однопроволочные в исполнении «ок»',
    ['Материал жилы', 'Медь'],
  ],
  [
    'Жилы|Медные; однопроволочное исполнение обозначается ок, лужёное — л',
    ['Материал жилы', 'Медь'],
  ],
  [
    'Жилы|Медные лужёные; «м» после сечения — нелужёная медь',
    ['Материал жилы', 'Медь'],
  ],
  [
    'Жила|Медная многопроволочная; индекс л означает лужёную жилу',
    ['Материал жилы', 'Медь'],
  ],
  ['Жилы|Многопроволочные медные лужёные', ['Материал жилы', 'Медь']],
  ['л|Медные лужёные жилы', ['Материал жилы', 'Медь']],
  [
    'U/UTP|Общий экран и экраны отдельных пар отсутствуют',
    ['Экранированный', 'Нет'],
  ],
  ['UTP|Неэкранированная витая пара', ['Экранированный', 'Нет']],
  [
    'F/UTP|Общий экран из фольги; отдельные пары без экранов',
    ['Экранированный', 'Да'],
  ],
  ['C|Экранирующая оплётка из лужёной меди', ['Экранированный', 'Да']],
  [
    'Экран|Алюмолавсановая лента с контактным проводником и медная лужёная оплётка',
    ['Экранированный', 'Да'],
  ],
  [
    'ХЛ|Холодостойкое исполнение',
    ['Климатическое исполнение', 'ХЛ (холодостойкое)'],
  ],
]);

const exempt = new Set(['family-0006']);

const shieldCodes = new Map([
  ['U/UTP', 'Нет'],
  ['F/UTP', 'Да'],
  ['SF/UTP', 'Да'],
  ['S/FTP', 'Да'],
  ['U/FTP', 'Да'],
]);
const beldenTable =
  'https://catalog.belden.com/prodimgs/AllAssets-approved/std.lang.all/07/37/PDF_40737.pdf#page=2';

function getRemainingSpecsPlan(product, decoded) {
  const { sourceName } = product;
  const tokens = decoded.tokens || [];
  const screen = sourceName
    .trim()
    .match(/^(U\/UTP|F\/UTP|SF\/UTP|S\/FTP|U\/FTP)(?=\s|$)/i)?.[1]
    .toUpperCase();
  const shortShield = sourceName
    .trim()
    .match(/^(UTP|FTP)(?=\s|$|-\s|-5[eе](?:\s|$))/i)?.[1]
    .toUpperCase();
  const insulation = 'Материал изоляции';
  const conductor = 'Материал жилы';
  let facts;
  let source;
  let basis;
  if (screen && tokens.some((t) => t.code === screen)) {
    facts = { Экранированный: shieldCodes.get(screen) };
    source = beldenTable;
    basis =
      'Belden, таблица 1, с. 2 · точный код ' +
      screen +
      ' определяет наличие экрана; характеристики кабелей Belden не переносились.';
  } else if (
    shortShield &&
    tokens.some(
      (t) =>
        t.code === shortShield &&
        (shortShield === 'UTP'
          ? t.text === 'Неэкранированная витая пара'
          : t.text ===
            'Обозначение экранированной витой пары; конструкцию экрана уточняют по паспорту')
    ) &&
    !tokens.some((t) => shieldCodes.has(t.code))
  ) {
    facts = { Экранированный: shortShield === 'UTP' ? 'Нет' : 'Да' };
    source =
      'https://www.belden.com/blog/smart-building/stp-utp-ftp-cable-and-when-to-use-them';
    basis =
      'Belden · пояснение обозначений витой пары. В исходной записи явно указан код ' +
      shortShield +
      '. Из FTP выводится только наличие экрана, его расположение и материал не определены.';
  } else if (
    /^NYY\s+3[xх×]25-J\s+RM\/16RE$/i.test(sourceName.trim()) &&
    tokens.some(
      (t) =>
        t.code === 'NYY' &&
        t.text === 'Медный кабель с ПВХ изоляцией и оболочкой'
    )
  ) {
    facts = {
      [conductor]: 'Медь',
      [insulation]: 'ПВХ-пластикат',
      'Материал оболочки': 'ПВХ-пластикат',
    };
    source = 'https://tr.prysmian.com/en/yvv-u_yvv-r_nyy';
    basis =
      'Prysmian · YVV-U / YVV-R / NYY, раздел Description. Добавлены только общие материалы NYY. Конфигурация RM/16RE сохранена из записи SKU.';
  } else if (
    /^N2XH-[JO]\s+\d+\s*[xх×]\s*\d/i.test(sourceName) &&
    !/FE\s*\d|FR|E\s*90/i.test(sourceName) &&
    tokens.some(
      (t) =>
        t.code === '2X' && t.text === 'Изоляция из сшитого полиэтилена (XLPE)'
    ) &&
    tokens.some(
      (t) =>
        t.code === 'H' &&
        t.text === 'Наружная оболочка из композиции без галогенов'
    )
  ) {
    facts = {
      [insulation]: 'Сшитый полиэтилен',
      'Материал оболочки': 'Безгалогенная полимерная композиция',
    };
    source =
      'https://hu.prysmian.com/sites/default/files/PGHU_N2XH_NA2XH-inclCPR_EN_8pgA4_original_1.pdf#page=4';
    basis =
      'Prysmian · таблица Technical Data, N2XH-O(J). Коды 2X и H подтверждают материалы; класс CPR и заводские параметры не перенесены.';
  } else if (
    /^ППСРВМ\s+\d/i.test(sourceName) &&
    tokens.some(
      (t) =>
        t.code === 'ППСРВМ' &&
        t.text ===
          'Гибкая медная жила; резиновая изоляция; оболочка из ПВХ-пластиката'
    )
  ) {
    facts = {
      [conductor]: 'Медь',
      [insulation]: 'Резина',
      'Материал оболочки': 'ПВХ-пластикат',
    };
    source =
      'https://kamkabel.ru/upload/iblock/a48/mbst3jr07q5tnw3p91vlh5bk2trxpiga.pdf#page=159';
    basis =
      'Камский Кабель · ППСРВМ, с. 159. Применены материалы точной марки; численные параметры и гибкость не перенесены.';
  } else if (
    decoded.evidence?.documentId === 'habia-e2419-original' &&
    /^HABIA Cable E2419\s+0[.,]24(?=\s|$)/i.test(sourceName)
  ) {
    facts = { [conductor]: 'Медь', [insulation]: 'Политетрафторэтилен (PTFE)' };
    source =
      'https://www.habia.com/globalassets/document-downloads/single-wires/single-wires---ptfe---e.pdf#page=1';
    basis =
      'Habia · PTFE / E, строка E 2419. Медная основа и PTFE; покрытие жилы и численные параметры не перенесены.';
  } else if (
    decoded.evidence?.documentId === 'cicm-jc2xfer' &&
    /^JC2XFE-R\s+[124]\s*[xх×]\s*2\s*[xх×]\s*1\s*$/i.test(sourceName)
  ) {
    facts = {
      [conductor]: 'Медь',
      [insulation]: 'Сшитый полиэтилен',
      Экранированный: 'Да',
      'Материал оболочки': 'Безгалогенная полимерная композиция',
    };
    source = 'https://cicm.cz/produkty/jcxfe-r/';
    basis =
      'CICM · JC2XFE-R, раздел Konstrukce. Общие характеристики базовой марки; варианты жил и специальные исполнения отдельно.';
  } else if (
    decoded.evidence?.documentId === 'bitner-as-fe180' &&
    /^BiTflame AS FE\s*180\/E90\s+(?:4|10|20)\s*[xх×]\s*2\s*[xх×]\s*0[.,]8\s*$/i.test(
      sourceName
    )
  ) {
    facts = {
      [conductor]: 'Медь',
      [insulation]: 'Слюдяная лента и безгалогенный компаунд',
      'Материал оболочки': 'Безгалогенная полимерная композиция',
    };
    source =
      'https://bitner-cablefactory.com/data/t4txt_photos/085246140519_BiTflame%20AS%20FE%20180_E90.pdf#page=1';
    basis =
      'BITNER · BiTflame AS FE180/E90, печатная с. 218, раздел Design. Изоляция включает обмотку по жиле; параметры готовой кабельной системы не переносились.';
  } else if (
    decoded.evidence?.documentId === 'incab-full-2025' &&
    /^ДПЛ-П\s+(?:04У\s+1[xх×]4|16М\s+2[xх×]8|24У\s+3[xх×]8)\s+-?2[.,]7\s*кН$/i.test(
      sourceName.trim()
    )
  ) {
    facts = {
      Бронированный: 'Да',
      'Тип брони': 'Стальная гофрированная лента',
    };
    source = 'https://incab.ru/optical-cable/in-duct/dpl/';
    basis =
      'Инкаб · стандартный ДПЛ-П-2,7 кН, схема конструкции, позиция 7. Добавлены только наличие и тип брони, общие для трёх конфигураций волокон.';
  } else if (
    decoded.evidence?.documentId === 'kam-2026' &&
    /^ПГРО\s+(?:4|10|16)$/i.test(sourceName.trim()) &&
    tokens.some(
      (t) => t.code === 'Изоляция' && t.text === 'Кремнийорганическая резина'
    )
  ) {
    facts = { [conductor]: 'Медь', [insulation]: 'Кремнийорганическая резина' };
    source =
      'https://kamkabel.ru/upload/iblock/e54/3jmohqdxy89f8pqelhibxzay952tlxh2.pdf';
    basis =
      'Камский Кабель · номенклатурный каталог, строка ПГРО, колонка «Элементы конструкции». Общие материалы жилы и изоляции, без параметров гибкости и без трактовки внешней оплётки как оболочки.';
  } else if (
    decoded.evidence?.documentId === 'hka' &&
    /^ВПП\s+1\s*[xх×]\s*(?:2[.,]5|10|35)$/i.test(sourceName.trim())
  ) {
    facts = { [insulation]: 'Полиэтилен', 'Материал оболочки': 'Полиэтилен' };
    source =
      'https://podolskkabel.ru/catalog/kabeli-vodopogruzhnye/vpp/vpp-vpp-660v-50-0/';
    basis =
      'Подольскабель · ВПП, описание марки и схема конструкции. Подтверждены материалы обоих слоёв для марки ВПП; параметры показанного типоразмера не перенесены.';
  } else if (
    decoded.evidence?.documentId === 'hka' &&
    /^ПНСВ\s+1[xх×]1[.,][24](?:\s+(?:бел|черн))?$/i.test(sourceName.trim()) &&
    tokens.some((t) => t.code === 'С' && t.text === 'Стальная жила')
  ) {
    facts = { [conductor]: 'Сталь' };
    source = 'https://artex-ural.ru/pnsv-ptpg';
    basis =
      'Артэкс · ПНСВ, варианты исполнения. Код С обозначает стальную жилу; покрытие стали и материал изоляции зависят от исполнения.';
  } else if (
    decoded.evidence?.documentId === 'spec-automation' &&
    /^КСБГК\s+[123][xх×]2[xх×](?:1[.,][15]|2)\s+нг\(А\)-?FR(?:HF|LS)$/i.test(
      sourceName.trim()
    )
  ) {
    const isHF = /FRHF$/i.test(sourceName.trim());
    facts = {
      [conductor]: 'Медь',
      [insulation]: 'Керамообразующая кремнийорганическая резина',
      Экранированный: 'Да',
      Бронированный: 'Да',
      'Тип брони': 'Оплётка из стальных оцинкованных проволок',
      'Материал оболочки': isHF
        ? 'Безгалогенная полимерная композиция'
        : 'ПВХ-пластикат пониженной пожарной опасности',
    };
    source = isHF
      ? 'https://spetskabel.ru/products/14/25/'
      : 'https://spetskabel.ru/products/14/26/';
    basis =
      'Спецкабель · КСБГКнг(А)-' +
      (isHF ? 'FRHF' : 'FRLS') +
      ', раздел «Конструкция». Материал изоляции относится к жилам, материал оболочки определён по пожарному индексу. Численные параметры не перенесены.';
  } else if (
    decoded.evidence?.documentId === 'hka' &&
    /^ТППэпБбШп\s+(?:10[xх×]2[xх×]0[.,][45](?:-200)?|(?:20|30)[xх×]2[xх×]0[.,]5)$/i.test(
      sourceName.trim()
    )
  ) {
    facts = {
      [conductor]: 'Медь',
      [insulation]: 'Полиэтилен',
      Экранированный: 'Да',
      Бронированный: 'Да',
      'Тип брони': 'Стальные ленты',
      'Материал оболочки': 'Полиэтилен',
    };
    source =
      'https://kazkabel.kz/catalog-ru/prod-provoda-i-kabeli-svyazi-tppep-ru';
    basis =
      'Казкабель · ТППэпБбШп, таблица 1 и разделы конструкции; ГОСТ Р 51311-99, п. 4.1.1.17, поясняет тип покрова. Суффикс 200 не использован для численных характеристик.';
  } else if (
    decoded.evidence?.documentId === 'mkm-k9rv-2026' &&
    /^К9РВСБПМ\s+нг\(А\)-?HF\s+(?:3[xх×](?:2[.,]5|4)|4[xх×]16|5[xх×](?:2[.,]5|4))$/i.test(
      sourceName.trim()
    )
  ) {
    facts = {
      [conductor]: 'Медь',
      [insulation]: 'Высокомодульная этиленпропиленовая резина',
      Бронированный: 'Да',
      'Тип брони': 'Стальные оцинкованные ленты',
      'Материал оболочки': 'Безгалогенная полимерная композиция',
    };
    source = 'https://www.mkm.ru/files/catalog/k9rv.pdf#page=4';
    basis =
      'МКМ · заводской каталог, сохранённая копия, с. 4, строка К9РВСБПМнг(А)-HF. Только медное исполнение HF с ленточной бронёй. Исполнения КА и FRHF вне правила.';
  } else if (
    decoded.evidence?.documentId === 'paritet-1' &&
    /^КСРП\s+(?:1[xх×]2[xх×](?:0[.,]97|1[.,]13)|2[xх×]0[.,]5)\s+нг\(А\)-?FRHF$/i.test(
      sourceName.trim()
    )
  ) {
    facts = {
      [conductor]: 'Медь',
      [insulation]: 'Керамообразующая кремнийорганическая резина',
      'Материал оболочки': 'Безгалогенная полимерная композиция',
      Экранированный: 'Нет',
    };
    source = 'https://paritet.su/catalog/ksrpng_a_frhf/';
    basis =
      'Паритет · КСРПнг(А)-FRHF, раздел «Конструкция» и схема марки. Материалы общие для парной и общей скрутки. Индекс Э относится к отдельной марке КСРЭП.';
  } else if (
    decoded.evidence?.documentId === 'spec-automation' &&
    /^КСБС\s+(?:1[xх×]2[xх×]0[.,](?:64|98)\s+нг\(А\)-?FRLS|2[xх×]2[xх×]1[.,]13\s+нг\(А\)-?FRHF)$/i.test(
      sourceName.trim()
    )
  ) {
    const isHF = /FRHF$/i.test(sourceName.trim());
    facts = {
      [conductor]: 'Медь',
      [insulation]: 'Керамообразующая кремнийорганическая резина',
      'Материал оболочки': isHF
        ? 'Безгалогенная полимерная композиция'
        : 'ПВХ-пластикат пониженной пожарной опасности',
      Экранированный: 'Да',
    };
    source = isHF
      ? 'https://spetskabel.ru/products/14/21/'
      : 'https://spetskabel.ru/products/14/22/';
    basis =
      'Спецкабель · КСБСнг(А)-' +
      (isHF ? 'FRHF' : 'FRLS') +
      ', раздел «Конструкция». Изоляция относится к жилам; дополнительный барьер вокруг пары — отдельный слой. Оболочка определена по точному индексу.';
  } else if (
    decoded.evidence?.documentId === 'hka' &&
    /^КНРЭк\s+(?:(?:10|16|30)[xх×]1[.,]5|4[xх×]10)$/i.test(sourceName.trim())
  ) {
    facts = {
      [conductor]: 'Медь',
      [insulation]: 'Резина',
      'Материал оболочки': 'ПВХ-пластикат',
      Экранированный: 'Да',
    };
    source =
      'https://www.holdcable.com/products/knrek/knrek_10kh1_690v_gost_7866_2_76/';
    basis =
      'Холдинг Кабельный Альянс · КНРЭк, раздел конструкции, и ГОСТ 7866.2-76, описание марки. Экран между двумя ПВХ-оболочками. Способ исполнения экрана и напряжение из примера не переносились.';
  } else if (
    decoded.evidence?.documentId === 'paritet-1' &&
    /^КИС-РВ\s+(?:1[xх×]2[xх×]0[.,](?:78|8)|2[xх×]2[xх×]0[.,]64)\s+нг\(А\)-?FRLS$/i.test(
      sourceName.trim()
    )
  ) {
    facts = {
      [insulation]: 'Кремнийорганическая резина и полиолефин',
      'Материал оболочки': 'ПВХ-пластикат пониженной пожарной опасности',
      Экранированный: 'Да',
    };
    source = 'https://www.paritet.su/upload/iblock/8c5/Catalog_Paritet.pdf';
    basis =
      'Паритет · раздел «Кабели огнестойкие для промышленного интерфейса RS-485», схема КИС-РВнг(А)-FRLS и таблица материала оболочки. Для указанных конфигураций общие слои и наличие экрана; параметры диаметра, бронированных версий и FRLSLTx не переносились.';
  } else if (
    decoded.evidence?.documentId === 'gerda-kvip' &&
    /^КВИП\s+нг\(А\)\s*-?(?:FRHF\s+2[xх×]2[xх×]1[.,]2\s+ПЭ|FRLS\s+[12][xх×]2[xх×]1\s+ЭВК|LS\s+[14][xх×]2[xх×]1\s+ВЭЛ-?ХЛ)$/iu.test(
      sourceName.trim()
    )
  ) {
    facts = {
      Экранированный: 'Да',
      'Материал оболочки': /\sПЭ$/iu.test(sourceName.trim())
        ? 'Безгалогенная полимерная композиция'
        : 'ПВХ-пластикат',
    };
    source =
      'https://gerda.ru/upload/iblock/fcf/fcfe7dce720f7f1e189297ad53bd8ed9.pdf#page=3';
    basis =
      'ГЕРДА · КВИП, таблица маркообразования, с. 3. ПЭ, ЭВК и ВЭЛ-ХЛ сверены отдельно; в таблицу вынесены только материал оболочки и наличие экрана.';
  } else if (
    decoded.evidence?.documentId === 'hka' &&
    /^ТППШнг(?:\(А\))?\s+(?:5|20|50|100)[xх×]2[xх×]0[.,]64(?:-315)?$/iu.test(
      sourceName.trim()
    )
  ) {
    facts = {
      [conductor]: 'Медь',
      [insulation]: 'Полиэтилен',
      Экранированный: 'Да',
    };
    source = decoded.sources?.find((s) => s.documentId === 'hka')?.url;
    basis =
      'ХКА · каталог телефонных кабелей, с. 334, конструкция ТППШ. Общие свойства жил и экрана подтверждены; сокращённый индекс Ш не определяет материал защитного шланга.';
  } else if (
    decoded.evidence?.documentId === 'lapp-130h' &&
    /^OLFLEXclassic 130h\s+2\s*[xх×]\s*(?:0[.,]5|1[.,]5)$/iu.test(
      sourceName.trim()
    )
  ) {
    facts = {
      [conductor]: 'Медь',
      'Материал оболочки': 'Безгалогенная полимерная композиция',
    };
    source =
      'https://imager.lapp.com/e/lapp/yhopSrJSr__z0n_QyKeLLQ~~/DB1123000EN.pdf#page=1';
    basis =
      'LAPP · ÖLFLEX CLASSIC 130 H, лист 1123000, раздел Design. У SKU YU-0007211 той же серии подтверждена медь. Число жил и сечение отличаются, материал жилы общий. Оболочка подтверждена непосредственно техлистом. Артикулы и вариант BK не переносились.';
  } else if (
    decoded.familyRecordId === 'family-0571' &&
    /^КГВШ\s+[23][xх×]0[.,](?:5|75)$/iu.test(sourceName.trim())
  ) {
    facts = {
      [conductor]: 'Медь',
      [insulation]: 'ПВХ-пластикат',
      'Материал оболочки': 'ПВХ-пластикат',
    };
    source =
      'https://nk-kabel.ru/catalog/kabeli/kabeli_shakhtnye/kgvsh/kgvsh_2x1/';
    basis =
      'КГВШ · раздел конструкции и отраслевой сборник ВНИИКП, КГВШ / КГРШ / КГРВШ. Для точной марки общие материалы; класс жил и численные параметры исключены.';
  } else if (
    decoded.familyRecordId === 'family-0106' &&
    /^ТППэпЗБбШп\s+(?:5|10|50)[xх×]2[xх×]0[.,]5$/iu.test(sourceName.trim())
  ) {
    facts = {
      [insulation]: 'Полиэтилен',
      'Материал оболочки': 'Полиэтилен',
      Экранированный: 'Да',
      Бронированный: 'Да',
      'Тип брони': 'Стальные ленты',
    };
    source =
      'https://kazkabel.kz/catalog-ru/prod-provoda-i-kabeli-svyazi-tppep-ru';
    basis =
      'Казкабель · ТППэпЗБбШп, разделы конструкции, защитного покрова и таблица 1. Индексы эп и Бб различают экран и броню. Точное покрытие и число лент не установлены.';
  } else if (
    decoded.familyRecordId === 'family-0295' &&
    /^НВМ\s+0[.,](?:21|35|5)\s+(?:желтый|зелёный|бел)$/iu.test(
      sourceName.trim()
    )
  ) {
    facts = { [conductor]: 'Медь', [insulation]: 'ПВХ-пластикат' };
    source = 'https://www.holdcable.com/products/nvm/';
    basis =
      'ХКА · состав НВМ, согласуется с описанием НВМ в ГОСТ 17515-72. Применяется к одножильным записям. Число проволок, лужение и номинал не выводятся.';
  } else if (
    decoded.familyRecordId === 'family-0174' &&
    /^КУГПП\s+(?:нг\(А\)-?HF\s+2[xх×]1[.,]5|(?:[23][xх×]0[.,]5|7[xх×]1[.,]5)\s+нг\(А\)-?HF)$/iu.test(
      sourceName.trim()
    )
  ) {
    facts = {
      [insulation]: 'Безгалогенная полимерная композиция',
      'Материал оболочки': 'Безгалогенная полимерная композиция',
    };
    source = 'https://www.mpkabel.ru/catalog.pdf#page=28';
    basis =
      'МП Кабель · таблица марок КуПП и КуГПП нг(А)-HF. Для HF подтверждены общие материалы двух слоёв. Исполнение FRHF оставлено отдельно.';
  } else if (
    decoded.evidence?.documentId === 'tomsk-toflex' &&
    /^КУПП\s+(?:2|12|20)[xх×]2[xх×]0[.,]8\s+нг\(А\)-?HF$/iu.test(
      sourceName.trim()
    )
  ) {
    facts = {
      [conductor]: 'Медь',
      [insulation]: 'Безгалогенная полимерная композиция',
      'Материал оболочки': 'Безгалогенная полимерная композиция',
    };
    source = decoded.sources?.find((s) => s.documentId === 'tomsk-toflex')?.url;
    basis =
      'КУПП нг(А)-HF · таблица маркообразования ToFlex. Два индекса П определяют материалы двух слоёв. Медь общая для исполнений с лужением и без него.';
  } else if (
    decoded.evidence?.documentId === 'ekm-ship-insil' &&
    /^ИнСил-А\s+(?:знг\(А\)-?LS\s+(?:3|10)|нг\(А\)-?ХЛ\s+(?:4|10))[xх×]1$/iu.test(
      sourceName.trim()
    ) &&
    tokens.some((t) => t.code === 'А' && t.text === 'Без экрана и брони')
  ) {
    facts = { Экранированный: 'Нет', Бронированный: 'Нет' };
    source = decoded.sources?.find(
      (s) => s.documentId === 'ekm-ship-insil'
    )?.url;
    basis =
      'ИНТЕХ · точная расшифровка ИнСил-А. Базовый индекс А определяет отсутствие экрана и брони. Индексы заполнения, пожарного и климатического исполнения эти слои не добавляют.';
  } else if (
    decoded.evidence?.documentId === 'spkb-techno-current' &&
    /^КПГКПКГ\s+нг\(А\)-?FRHF\s+(?:1[xх×]2[xх×][12][.,]5|2[xх×]2[xх×]1[.,]5)$/iu.test(
      sourceName.trim()
    )
  ) {
    facts = {
      [conductor]: 'Медь',
      Бронированный: 'Да',
      'Тип брони': 'Стальные оцинкованные проволоки',
    };
    source = decoded.sources?.find(
      (s) => s.documentId === 'spkb-techno-current'
    )?.url;
    basis =
      'СПКБ Техно · каталог, с. 22, КПГКПКГ нг(А)-FRHF. Общие материалы жил и брони; класс жил и геометрия повива не переносились.';
  } else if (
    decoded.evidence?.documentId === 'kam-2026' &&
    /^БФСЭЗ\s+[23][xх×]0[.,]35\s+черн$/iu.test(sourceName.trim()) &&
    tokens.some(
      (t) =>
        t.code === 'Изоляция' &&
        t.text === 'Комбинированная стеклополиимидно-фторопластовая изоляция'
    ) &&
    tokens.some(
      (t) =>
        t.code === 'Э' && t.text === 'Экран из медных никелированных проволок'
    )
  ) {
    facts = {
      [insulation]: 'Стеклополиимидно-фторопластовая изоляция',
      Экранированный: 'Да',
    };
    source = decoded.sources?.find((s) => s.documentId === 'kam-2026')?.url;
    basis =
      'Камский Кабель · сохранённая расшифровка БФСЭЗ, изоляция и индекс Э. Неопределённость металла жилы не влияет на эти два поля.';
  } else if (
    decoded.evidence?.documentId === 'podolsk-9' &&
    /^КСТПЭП\s+нг(?:\(А\))?-?FRHF\s+[24][xх×]1$/iu.test(sourceName.trim()) &&
    tokens.some(
      (t) =>
        t.code === 'Э' &&
        t.text === 'Общий экран — оплётка из медных лужёных проволок'
    )
  ) {
    facts = { [conductor]: 'Медь', Экранированный: 'Да' };
    source = decoded.sources?.find((s) => s.documentId === 'podolsk-9')?.url;
    basis =
      'Подольсккабель · КСТПЭП FRHF, сохранённая таблица конструкции. Медь жил и общий экран одинаковы для указанных конфигураций. Категория нг, параметры барьера и LOCA отдельно.';
  } else if (
    decoded.evidence?.documentId === 'chuvash-vol2' &&
    /^МПО 33-11\s+1[xх×]0[.,]5\s+(?:белый|голубой|фиолетовый)$/iu.test(
      sourceName.trim()
    ) &&
    tokens.some(
      (t) =>
        t.code === 'Изоляция и защитные элементы' &&
        t.text.startsWith('Изоляция из плёнки фторопласта-4;')
    )
  ) {
    facts = {
      [conductor]: 'Медь',
      [insulation]: 'Фторопласт-4',
      'Материал оболочки': 'Полиэфирная оплётка с кремнийорганическим лаком',
    };
    source = decoded.sources?.find((s) => s.documentId === 'chuvash-vol2')?.url;
    basis =
      'Сохранённый заводской лист МПО 33-11. Материалы одинаковы для указанных цветов. Наружный слой — оплётка с лаком, точные характеристики и соседние шифры не переносились.';
  } else if (
    /^HELUKABEL\s+SiF\s/i.test(sourceName) &&
    tokens.some((t) => t.code === 'Si' && t.text === 'Силиконовая изоляция')
  ) {
    facts = { [insulation]: 'Силиконовая резина' };
    source =
      'https://www.helukabel.com/publication/DE/CATALOGUES/CW/Auswahltabellen_EN/Kap_K_284-323_en_link.pdf#page=24';
    basis =
      'HELUKABEL · SiF, раздел Cable structure: Core insulation of silicone. Изготовитель и серия указаны в складском названии.';
  } else if (
    decoded.evidence?.documentId === 'uglich-mediastrip-current' &&
    /^MEDIAstrip BH\s+(?:3x4|5x6)\s+06\/1кв$/i.test(sourceName.trim())
  ) {
    facts = {
      [insulation]: 'Этиленпропиленовая резина',
      Бронированный: 'Да',
      'Тип брони': 'Стальные оцинкованные ленты',
    };
    source = 'https://www.uglichcable.ru/catalog/cables-mediastrip/';
    basis =
      'Угличкабель · силовые кабели MEDIASTRIP, строка B H и описание изоляции. Точный код B H подтверждает ленточную броню. Материалы жилы и оболочки требуют отдельного подтверждения.';
  } else if (
    /^MEDIAstrip\s+H\s/i.test(sourceName) &&
    tokens.some(
      (t) => t.code === 'Изоляция' && t.text === 'Этиленпропиленовая резина'
    )
  ) {
    facts = { [insulation]: 'Этиленпропиленовая резина' };
    source = 'https://www.uglichcable.ru/catalog/cables-mediastrip/';
    basis =
      'Угличкабель · страница силовых кабелей MEDIASTRIP, исполнение H. Добавлен только общий материал изоляции по точной торговой марке.';
  } else if (
    /^ЛОУТОКС\s+20нг\(А\)-?FRLSLTx\s/i.test(sourceName) &&
    tokens.some(
      (t) =>
        t.code === 'Конструкция' && t.text.includes('керамообразующей резины')
    )
  ) {
    facts = {
      [conductor]: 'Медь',
      [insulation]: 'Керамообразующая кремнийорганическая резина',
      'Материал оболочки': 'ПВХ-пластикат пониженной пожарной опасности',
    };
    source = 'https://spetskabel.ru/products/1/390/';
    basis =
      'Спецкабель · ЛОУТОКС 20нг(А)-FRLSLTx Nx2xS, раздел «Конструкция». Применено только к точному индексу, распознанному в складской записи.';
  } else return null;

  const profile = {
    mark: product.mark,
    source,
    checkedOn: '2026-11-14',
    triageMethod: ['family-0312', 'family-0091', 'family-0921'].includes(
      decoded.familyRecordId
    ),
    familyMethod: [
      'family-0571',
      'family-0106',
      'family-0295',
      'family-0174',
    ].includes(decoded.familyRecordId),
  };
  const fields = Object.entries(facts)
    .filter(([k, v]) => product.specs?.[k] != null && product.specs[k] !== v)
    .map(([k]) => k);
  return {
    profile,
    specs: facts,
    fields,
    ...(fields.length && {
      reason:
        'Расхождение подтверждённой конструкции и полей таблицы: ' +
        fields.join(', ') +
        '.',
    }),
    origins: Object.fromEntries(Object.keys(facts).map((k) => [k, basis])),
    variant: {},
  };
}

function hasOnlySizeWarning(decoded) {
  return (
    decoded.status === 'partial' &&
    Boolean(decoded.evidence?.documentId) &&
    decoded.warnings?.length === 1 &&
    decoded.warnings[0] ===
      'Сложная конфигурация жил разобрана не полностью; единицы и дополнительные элементы требуют сверки с документацией.'
  );
}

export function getExplicitSpecsPlan(product, decoded) {
  const id = decoded?.familyRecordId;
  if (exempt.has(id) || profiles[id] || additionalProfiles[id]) return null;
  if (
    isProductPending(product) ||
    (decoded.status !== 'reviewed' && !hasOnlySizeWarning(decoded)) ||
    (decoded.warnings?.length && !hasOnlySizeWarning(decoded)) ||
    decoded.unknown?.length ||
    product.parsingWarnings?.length ||
    !product.sourceName
  )
    return null;

  if (!id || !decoded.evidence?.documentId)
    return getRemainingSpecsPlan(product, decoded);

  // Only exact, unconditional statements from the existing reviewed decoder.
  // No matching by similar marks, no interpretation of prose or numeric values.
  const specs = {};
  const origins = {};
  const disagreements = new Set();
  const add = (label, value, token) => {
    const current = product.specs?.[label];
    if (
      (current != null && current !== value) ||
      (Object.hasOwn(specs, label) && specs[label] !== value)
    ) {
      disagreements.add(label);
      return;
    }
    specs[label] = value;
    origins[label] =
      'Проверенная расшифровка · «' + token.code + '»: ' + token.text;
  };
  const attributes = (product.attributes || []).join(' ');
  const hasHF = /HF|LSZH/i.test(attributes + ' ' + product.sourceName);
  const hasLayerException = /FR|HF|LSZH/i.test(
    attributes + ' ' + product.sourceName
  );
  const tokens = decoded.tokens || [];
  const documentId = decoded.evidence?.documentId;
  if (hasOnlySizeWarning(decoded)) {
    const token = tokens.find(
      (t) => ['Жилы', 'Жила', 'А'].includes(t.code) && metals.has(t.text)
    );
    if (!token) return null;
    add('Материал жилы', metals.get(token.text), token);
    return {
      profile: {
        mark: product.mark,
        source: decoded.sources?.find((s) => s.documentId === documentId)?.url,
      },
      specs,
      origins,
      variant: {},
    };
  }
  for (const token of tokens) {
    const { code, text } = token;
    const value = materials.get(text);
    if (value && layers[code] && !hasLayerException) {
      for (const label of layers[code]) add(label, value, token);
    }
    if (['Жилы', 'Жила', 'А'].includes(code) && metals.has(text))
      add('Материал жилы', metals.get(text), token);
    if (
      code === 'Броня' &&
      ['Стальные ленты', 'Стальная ленточная броня'].includes(text)
    ) {
      add('Бронированный', 'Да', token);
      add('Тип брони', 'Стальные ленты', token);
    }
  }
  if (hasHF && (product.specs?.['Материал оболочки'] || '').includes('ПВХ'))
    disagreements.add('Материал оболочки');
  if (!Object.keys(specs).length && !disagreements.size) {
    for (const token of tokens) {
      const { code, text } = token;
      const layer = explicitLayers.get(text);
      if (layer && !hasLayerException) {
        for (const label of layers[layer[0]]) add(label, layer[1], token);
      }
      if (['Жилы', 'Жила', 'А', 'М'].includes(code) && moreMetals.has(text))
        add('Материал жилы', moreMetals.get(text), token);
      const armor = explicitArmor.get(text);
      if (armor && ['К', 'Б', 'Кб', 'Броня', 'T'].includes(code)) {
        add('Бронированный', 'Да', token);
        add('Тип брони', armor, token);
      }
      if (explicitScreens.has(text)) add('Экранированный', 'Да', token);
    }
  }
  if (!Object.keys(specs).length && !disagreements.size) {
    for (const token of tokens) {
      const fact = supplementaryFacts.get(token.code + '|' + token.text);
      if (fact && !(fact[0] === 'Материал изоляции' && hasLayerException))
        add(...fact, token);
      if (
        ['К', 'Ко'].includes(token.code) &&
        [
          'Броня в виде оплётки из стальных оцинкованных проволок',
          'Броня в виде оплётки из стальных оцинкованных проволок; с защитным шлангом',
        ].includes(token.text)
      ) {
        add('Бронированный', 'Да', token);
        add('Тип брони', 'Оплётка из стальных оцинкованных проволок', token);
      }
    }
  }
  if (!Object.keys(specs).length && !disagreements.size)
    return getRemainingSpecsPlan(product, decoded);
  const profile = {
    mark: product.mark,
    source:
      decoded.sources?.find((s) => s.documentId === documentId)?.url ||
      decoded.sources?.[0]?.url,
  };
  if (disagreements.size) {
    const fields = [...disagreements];
    return {
      profile,
      fields,
      specs,
      origins,
      reason:
        'В расшифровке и таблице или между элементами расшифровки расходятся значения полей: ' +
        fields.join(', ') +
        '.',
    };
  }
  return { profile, specs, origins, variant: {} };
}

export function applyExplicitSpecs(product, decoded) {
  const plan = getExplicitSpecsPlan(product, decoded);
  if (!plan?.specs) return product;
  const disputed = new Set(plan.fields || []);
  if (disputed.has('Бронированный') || disputed.has('Тип брони')) {
    disputed.add('Бронированный');
    disputed.add('Тип брони');
  }
  const additions = Object.entries(plan.specs).filter(
    ([key]) => !disputed.has(key) && product.specs?.[key] == null
  );
  if (!additions.length) return product;
  return {
    ...product,
    specs: { ...product.specs, ...Object.fromEntries(additions) },
  };
}
