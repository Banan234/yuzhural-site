import { isProductPending } from '../shared/productAvailability.js';

const hka =
  'https://elcable.ru/upload/iblock/736/ha0jwhn9l48g4zbglkp9mlxn61juko6o/1_KHKA_obshchiy_katalog.pdf';
const podolsk =
  'https://podolskkabel.ru/upload/iblock/b36/hd1ro84547hz76kdyhepwp8nldg3s3mg.pdf';
const spec =
  'https://spetskabel.ru/f/1/global/pricelist/spetskabel-catalog.pdf';
const pvc = 'ПВХ-пластикат';
const copper = { 'Материал жилы': 'Медь' };
const aluminum = { 'Материал жилы': 'Алюминий' };
const insulation = { 'Материал изоляции': pvc };
const layers = { ...insulation, 'Материал оболочки': pvc };
const shield = { Экранированный: 'Да' };
const steel = { Бронированный: 'Да', 'Тип брони': 'Стальные ленты' };
const wire = { Бронированный: 'Да', 'Тип брони': 'Стальные проволоки' };
const mounting = { Назначение: 'Монтаж межприборных соединений' };
const power = {
  Назначение:
    'Передача и распределение электроэнергии в стационарных установках',
};
const control = { Назначение: 'Подключение приборов в цепях контроля' };
const signaling = {
  Назначение: 'Передача сигналов в системах сигнализации и управления',
};
const install = { Назначение: 'Стационарный монтаж электрических цепей' };
const hf = {
  'Материал оболочки': 'Безгалогенная полимерная композиция',
  'Материал изоляции': 'Безгалогенная полимерная композиция',
};
const air = { Назначение: 'Воздушные линии электропередачи' };
const rule = (mark, specs, source, options = {}) => ({
  mark,
  specs,
  source,
  ...options,
});
export const additionalProfiles = {
  'family-0652': rule(
    'ПАВ',
    { ...aluminum, ...insulation, ...install },
    'https://alur.ru/f/pav_5.pdf',
    { markPattern: /^ПАВ(?:$|[0-9])/u, single: true }
  ),
  'family-0651': rule(
    'АС',
    {
      'Материал жилы': 'Алюминий и сталь',
      'Конструкция провода': 'Стальной сердечник, алюминиевые проволоки',
      Изоляция: 'Отсутствует',
      ...air,
    },
    'https://kamkabel.ru/upload/iblock/a48/mbst3jr07q5tnw3p91vlh5bk2trxpiga.pdf#page=131',
    { markPattern: /^АС[0-9]+(?:[,.][0-9]+)?\/[0-9]+(?:[,.][0-9]+)?$/u }
  ),
  'family-0814': rule(
    'НВМ',
    { ...copper, ...insulation, ...mounting },
    podolsk + '#page=35'
  ),
  'family-0453': rule(
    'КУВЭКВ',
    mounting,
    'https://tomskcable.ru/upload/Toflex_2018_catalog_web.pdf#page=69'
  ),
  'family-0429': rule(
    'КУВЭБВ',
    mounting,
    'https://tomskcable.ru/upload/Toflex_2018_catalog_web.pdf#page=66'
  ),
  'family-0340': rule(
    'КУВЭаВ',
    { ...shield, ...mounting },
    'https://tomskcable.ru/upload/Toflex_2018_catalog_web.pdf#page=48'
  ),
  'family-0548': rule(
    'ИнСил-ВБВ',
    power,
    'https://ek-m.com/web/files_pdf/buk-ins-sud-2024.pdf#page=6'
  ),
  'family-0210': rule(
    'КУМП-ИЭО',
    mounting,
    'https://www.rezhcable.ru/res/content/docs/f488_catalog_0_file.pdf#page=6',
    { modifiers: ['Э', 'З', 'Л'] }
  ),
  'family-0582': rule('КПЭП', { ...shield, ...signaling }, hka + '#page=402', {
    requireHF: true,
  }),
  'family-0290': rule(
    'КММ',
    {
      ...shield,
      Назначение: 'Подключение микрофонов и передача звуковых сигналов',
    },
    podolsk + '#page=9'
  ),
  'family-0137': rule('КПСЭС', { ...shield, ...signaling }, hka + '#page=401'),
  'family-0246': rule(
    'КСБГ',
    signaling,
    'https://spetskabel.ru/f/1/global/pricelist/spetskabel-automation.pdf#page=16'
  ),
  'family-0188': rule(
    'КСРВ',
    signaling,
    'https://paritet.su/upload/iblock/bd7/Paritet_catalog_2026.pdf#page=144'
  ),
  'family-0169': rule(
    'КНР',
    {
      'Материал жилы': 'Медь',
      'Материал изоляции': 'Резина',
      'Материал оболочки': 'Резина',
      Назначение: 'Электрические соединения на судах',
    },
    hka + '#page=437'
  ),
  'family-0075': rule(
    'РКГМ',
    {
      ...copper,
      'Материал изоляции': 'Кремнийорганическая резина',
      'Защитная оплётка': 'Стекловолокно',
      ...mounting,
    },
    hka + '#page=422',
    { single: true }
  ),
  'family-0293': rule(
    'РПШЭК',
    { 'Материал изоляции': 'Полиэтилен', 'Материал оболочки': pvc, ...shield },
    'https://podolskkabel.ru/upload/iblock/e13/w4ef6gbmtx9umc8wo9u0hw7t4k4j5vfx.pdf#page=5'
  ),
  'family-0606': rule(
    'СБВБПу',
    { Назначение: 'Цепи сигнализации и блокировки' },
    'https://www.samaracable.ru/upload/catalog.pdf#page=54'
  ),
  'family-0297': rule(
    'ПКСВ',
    {
      ...copper,
      ...insulation,
      Назначение: 'Кроссовые соединения станционного оборудования',
    },
    hka + '#page=363',
    { color: true }
  ),
  'family-0104': rule(
    'ТППэпБ',
    {
      ...copper,
      ...shield,
      ...steel,
      'Материал изоляции': 'Полиэтилен',
      Назначение: 'Телефонные линии связи',
    },
    hka + '#page=329',
    { modifiers: ['200'] }
  ),
  'family-0183': rule('ПБП', { ...steel, ...power }, hka + '#page=61', {
    requireHF: true,
  }),
  'family-0116': rule(
    'ППВ',
    { ...copper, ...insulation, ...install, 'Форма кабеля': 'Плоская' },
    'https://www.rkz.ru/cables/310/'
  ),
  'family-0659': rule(
    'ПУГНП',
    { ...copper, ...insulation, 'Форма кабеля': 'Плоская' },
    'https://mokz.ru/pugnp-2x2-5',
    { color: true }
  ),
  'family-0642': rule(
    'НВ',
    { 'Материал жилы': 'Лужёная медь', ...insulation, ...shield, ...mounting },
    podolsk + '#page=35',
    { modifiers: ['Э'] }
  ),
  'family-0036': rule(
    'АПвБбШв',
    {
      ...aluminum,
      ...power,
      ...steel,
      'Материал изоляции': 'Сшитый полиэтилен',
      'Материал оболочки': pvc,
    },
    'https://kamkabel.ru/upload/iblock/a48/mbst3jr07q5tnw3p91vlh5bk2trxpiga.pdf#page=28',
    { rejectHF: true }
  ),
  'family-0044': rule(
    'АПвБВ',
    {
      ...aluminum,
      ...power,
      ...steel,
      'Материал изоляции': 'Сшитый полиэтилен',
      'Материал оболочки': pvc,
    },
    hka + '#page=144',
    { rejectHF: true }
  ),
  'family-0274': rule(
    'БПДО',
    {
      'Материал изоляции': 'Радиационно сшитый полиэтилен и фторопласт',
      Назначение: 'Монтаж бортовых электрических цепей',
    },
    'https://podolskkabel.ru/upload/iblock/b10/au03b8kvt8q4jmh3gftpa1xk9o1u8im3.pdf#page=4'
  ),
  'family-0275': rule(
    'БПДО',
    {
      'Материал изоляции': 'Радиационно сшитый полиэтилен и фторопласт',
      ...shield,
      Назначение: 'Монтаж бортовых электрических цепей',
    },
    'https://podolskkabel.ru/upload/iblock/b10/au03b8kvt8q4jmh3gftpa1xk9o1u8im3.pdf#page=4',
    { modifiers: ['Э'] }
  ),
  'family-0585': rule(
    'F-CY-JZ',
    { ...shield, Назначение: 'Цепи управления и соединения оборудования' },
    'https://www.helukabel.co.uk/helukabel/uk-in-stock/f-cy-jz.pdf#page=1'
  ),
  'family-0156': rule(
    'UNITRONIC LIYY',
    { ...layers, Назначение: 'Передача данных и сигналов' },
    'https://www.lapp.com/en/fr/unitronic-liyy/p/0028702'
  ),
  'family-0028': rule(
    'КВВБ',
    { ...layers, ...steel, ...control },
    hka + '#page=193',
    { rejectHF: true }
  ),
  'family-0142': rule(
    'КВЭБШВ',
    { ...steel, ...shield, ...control },
    hka + '#page=209',
    { pvcLayers: true }
  ),
  'family-0257': rule(
    'КИС-П',
    { Назначение: 'Передача сигналов интерфейса RS-485' },
    'https://paritet.su/upload/iblock/bd7/Paritet_catalog_2026.pdf#page=169'
  ),
  'family-0187': rule(
    'КСПэВ',
    {
      'Материал изоляции': 'Полиэтилен',
      'Материал оболочки': pvc,
      ...shield,
      ...signaling,
    },
    'https://paritet.su/upload/iblock/bd7/Paritet_catalog_2026.pdf#page=8',
    { rejectHF: true }
  ),
  'family-0494': rule(
    'ААБ2л',
    {
      ...aluminum,
      ...power,
      ...steel,
      'Материал изоляции': 'Пропитанная бумага',
      'Материал оболочки': 'Алюминий',
    },
    'https://kamkabel.ru/upload/iblock/a48/mbst3jr07q5tnw3p91vlh5bk2trxpiga.pdf#page=5',
    { aliases: ['ААБ2л- 6', 'ААБ2л-10', 'ААБ2л-1'] }
  ),
  'family-0497': rule(
    'АСБ',
    {
      ...aluminum,
      ...power,
      ...steel,
      'Материал изоляции': 'Пропитанная бумага',
      'Материал оболочки': 'Свинец',
    },
    'https://kamkabel.ru/upload/iblock/a48/mbst3jr07q5tnw3p91vlh5bk2trxpiga.pdf#page=8',
    { aliases: ['АСБ- 1', 'АСБ-6', 'АСБ-10'] }
  ),

  'family-0030': rule(
    'ВБВ',
    { ...copper, ...power, ...steel },
    hka + '#page=117',
    { pvcLayers: true }
  ),
  'family-0493': rule(
    'ААБл',
    {
      ...aluminum,
      ...power,
      ...steel,
      'Материал изоляции': 'Пропитанная бумага',
      'Материал оболочки': 'Алюминий',
    },
    'https://kamkabel.ru/upload/iblock/a48/mbst3jr07q5tnw3p91vlh5bk2trxpiga.pdf#page=5',
    { aliases: ['ААБл- 1', 'ААБл- 6', 'ААБл-10'] }
  ),
  'family-0779': rule(
    'КГВБШВ',
    {
      ...copper,
      ...steel,
      Назначение: 'Электрические соединения оборудования',
    },
    'https://dn.ru/storage/certificates/elektrika/kabel-provodniki/cat-kavkazkabely-2024.pdf#page=10',
    { pvcLayers: true }
  ),
  'family-0141': rule(
    'КВЭБбШВ',
    { ...control, ...steel, ...shield },
    hka + '#page=209',
    { pvcLayers: true }
  ),
  'family-0124': rule(
    'КМПВэВ',
    { ...shield, ...mounting },
    'https://podolskkabel.ru/upload/iblock/35c/9y2fgwn51tb8h9afgkf39h797g42y4xe.pdf#page=4',
    { polyethylene: true, rejectHF: true }
  ),
  'family-0591': rule(
    'МКПсЭВ',
    { ...shield, ...mounting },
    'https://storage.yandexcloud.net/catalog/ekm/Каталог МКПс 2023.pdf#page=4',
    { modifiers: ['Э'] }
  ),
  'family-0099': rule(
    'ИнСил-ОЭКв',
    { ...shield, ...wire, ...mounting },
    'https://ek-m.com/web/files_pdf/buk-ins-sud-2024.pdf#page=3',
    { aliases: ['ИнСил-ОЭК'] }
  ),
  'family-0499': rule(
    'АСБл',
    {
      ...aluminum,
      ...power,
      ...steel,
      'Материал изоляции': 'Пропитанная бумага',
      'Материал оболочки': 'Свинец',
    },
    'https://kamkabel.ru/upload/iblock/a48/mbst3jr07q5tnw3p91vlh5bk2trxpiga.pdf#page=8',
    { aliases: ['АСБл-1', 'АСБл-6', 'АСБл-10'] }
  ),
  'family-0190': rule(
    'КУПВ',
    { Назначение: 'Цепи управления' },
    'https://podolskkabel.ru/upload/iblock/648/7xk6iw4byaniaqcixusj4oiictjyf1lf.pdf#page=16',
    { polyethylene: true, rejectHF: true }
  ),
  'family-0519': rule(
    'ПРКА',
    {
      ...copper,
      'Материал изоляции': 'Кремнийорганическая резина',
      Назначение: 'Монтаж электронагревательных приборов',
    },
    'https://kamkabel.ru/upload/iblock/a48/mbst3jr07q5tnw3p91vlh5bk2trxpiga.pdf#page=138',
    { color: true, single: true }
  ),
  'family-0024': rule(
    'АсВВГ',
    { 'Материал жилы': 'Алюминиевый сплав', ...power, Бронированный: 'Нет' },
    hka + '#page=109',
    { pvcLayers: true, modifiers: ['ПЛОСКИЙ'] }
  ),
  'family-0064': rule(
    'АПвПуГ',
    {
      ...aluminum,
      ...power,
      ...shield,
      'Материал изоляции': 'Сшитый полиэтилен',
      'Материал оболочки': 'Полиэтилен',
      Герметизация: 'Продольная',
    },
    hka + '#page=132',
    { modifiers: ['МК/16'] }
  ),
  'family-0780': rule(
    'КА9СПвП',
    {
      ...aluminum,
      ...power,
      'Материал изоляции': 'Сшитый полиэтилен',
      'Материал оболочки': 'Безгалогенная полимерная композиция',
    },
    'https://www.mkm.ru/files/catalog/k9.pdf#page=4',
    { requiredFire: 'НГ(А)HF' }
  ),
  'family-0595': rule(
    'ВБбШ',
    { ...copper, ...power, ...steel, ...insulation },
    'https://kamkabel.ru/upload/iblock/a48/mbst3jr07q5tnw3p91vlh5bk2trxpiga.pdf#page=21',
    { rejectHF: true }
  ),
  'family-0097': rule(
    'ИнСил-ОЭ',
    { ...shield, ...mounting },
    'https://ek-m.com/web/files_pdf/buk-ins-sud-2024.pdf#page=3',
    { modifiers: ['Э', 'З'] }
  ),
  'family-0266': rule(
    'КДВЭВГ',
    {
      ...layers,
      ...shield,
      Назначение: 'Соединение измерительных приборов и аппаратуры управления',
    },
    'https://paritet.su/upload/iblock/bd7/Paritet_catalog_2026.pdf#page=184',
    { rejectHF: true }
  ),
  'family-0209': rule(
    'КУМП-ОЭКс',
    { ...shield, ...wire, ...mounting },
    'https://www.rezhcable.ru/res/content/docs/f488_catalog_0_file.pdf#page=6',
    { modifiers: ['З'] }
  ),
  'family-0593': rule(
    'КСВэВ',
    { ...shield, ...signaling },
    'https://paritet.su/upload/iblock/bd7/Paritet_catalog_2026.pdf#page=8'
  ),
  'family-0126': rule(
    'КМПэВэВ',
    { ...shield, ...mounting },
    'https://podolskkabel.ru/upload/iblock/35c/9y2fgwn51tb8h9afgkf39h797g42y4xe.pdf#page=9',
    { polyethylene: true, rejectHF: true }
  ),
  'family-0111': rule(
    'СБВГ',
    {
      'Материал изоляции': 'Полиэтилен',
      'Материал оболочки': pvc,
      Назначение: 'Цепи сигнализации и блокировки',
    },
    hka + '#page=383',
    { rejectHF: true }
  ),
  'family-0170': rule(
    'КНРк',
    {
      'Материал изоляции': 'Резина',
      'Материал оболочки': pvc,
      Назначение: 'Электрические соединения на судах',
    },
    hka + '#page=443',
    { rejectHF: true }
  ),
  'family-0147': rule(
    'ППсТВМ',
    {
      'Материал изоляции': 'Термоэластопласт',
      Назначение: 'Монтаж электрических цепей подвижного состава',
    },
    hka + '#page=491'
  ),
  'family-0178': rule(
    'ПГВА',
    {
      ...copper,
      ...insulation,
      Назначение: 'Монтаж электрических цепей дорожных транспортных средств',
    },
    hka + '#page=560',
    { color: true, single: true, rejectHF: true }
  ),
  'family-0119': rule(
    'ШВВП',
    {
      ...copper,
      ...layers,
      'Форма кабеля': 'Плоская',
      Назначение: 'Подключение электрических приборов',
    },
    hka + '#page=556',
    { rejectHF: true }
  ),
  'family-0150': rule(
    'А',
    { ...aluminum, ...air, Изоляция: 'Отсутствует' },
    hka + '#page=521'
  ),
  'family-0032': rule(
    'АПвВГ',
    {
      ...aluminum,
      ...power,
      'Материал изоляции': 'Сшитый полиэтилен',
      'Материал оболочки': pvc,
      Бронированный: 'Нет',
    },
    hka + '#page=11',
    { rejectHF: true }
  ),
  'family-0594': rule(
    'ВКБШВ',
    { ...copper, ...wire },
    'https://podolskkabel.ru/upload/iblock/c24/8wbikhsdl7ywtc5hevmt5ij57hfggv9f.pdf#page=13',
    { pvcLayers: true }
  ),
  'family-1067': rule(
    'RE-2X(ST)Y-FL',
    {
      ...shield,
      'Материал изоляции': 'Сшитый полиэтилен',
      'Материал оболочки': pvc,
      Назначение: 'Передача сигналов измерения и управления',
    },
    'https://www.2mkablo.com/en/pdf/instrumentation-cables/re-2x-st-y-fl#page=1',
    { rejectHF: true }
  ),
  'family-0305': rule(
    'МКЭфКШВ',
    { ...shield, ...wire, ...mounting },
    hka + '#page=294',
    { modifiers: ['ЭФ', 'Э'] }
  ),
  'family-0763': rule(
    'МКЭфШВ',
    { ...shield, ...mounting },
    'https://www.mkm.ru/products/montazhnye-kabeli/MKESH/#page=1',
    { modifiers: ['З', 'Э'] }
  ),

  'family-0120': rule(
    'НРШМ',
    { ...copper, Назначение: 'Стационарные электрические соединения на судах' },
    hka + '#page=441'
  ),
  'family-0153': rule(
    'NYY',
    { ...copper, ...layers, ...power },
    hka + '#page=100',
    { modifiers: ['J', 'O', 'RM', 'RE', 'CLASS', '2'], nym: true }
  ),
  'family-0140': rule('КВБВ', { ...control, ...steel }, hka + '#page=209', {
    pvcLayers: true,
  }),
  'family-0107': rule(
    'ТПВ',
    {
      'Материал изоляции': 'Полиэтилен',
      'Материал оболочки': pvc,
      Назначение: 'Телефонные распределительные линии',
    },
    hka + '#page=333',
    { modifiers: ['200', '315'], rejectHF: true }
  ),
  'family-0042': rule(
    'АПвВ',
    {
      ...aluminum,
      ...power,
      'Материал изоляции': 'Сшитый полиэтилен',
      'Материал оболочки': pvc,
    },
    hka + '#page=137',
    { modifiers: ['МК/50', 'МК/70'], rejectHF: true }
  ),
  'family-0098': rule(
    'ИнСил-ОЭБ',
    { ...copper, ...shield, ...steel, ...mounting },
    'https://ek-m.com/web/files_pdf/buk-ins-sud-2024.pdf#page=3'
  ),
  'family-0186': rule(
    'КСПВ',
    {
      'Материал изоляции': 'Полиэтилен',
      'Материал оболочки': pvc,
      ...signaling,
    },
    'https://paritet.su/upload/iblock/bd7/Paritet_catalog_2026.pdf#page=8',
    { rejectHF: true }
  ),
  'family-0103': rule(
    'ТППэпЗ',
    {
      ...copper,
      ...shield,
      'Материал изоляции': 'Полиэтилен',
      'Материал оболочки': 'Полиэтилен',
      'Заполнение сердечника': 'Гидрофобное',
      Назначение: 'Телефонные линии связи',
    },
    hka + '#page=319',
    { modifiers: ['200'], rejectHF: true }
  ),
  'family-0121': rule(
    'БПВЛ',
    {
      'Материал изоляции': pvc,
      Назначение: 'Монтаж бортового электрооборудования',
    },
    hka + '#page=465',
    { color: true }
  ),
  'family-0076': rule('МКШВ', mounting, hka + '#page=294', { pvcLayers: true }),
  'family-0284': rule(
    'КПЭТИ',
    { Назначение: 'Измерительные цепи' },
    'https://podolskkabel.ru/upload/iblock/d92/nng3jk9c6gr1hsrdwx6skca4s4fdsb46.pdf#page=2',
    { modifiers: ['ХА', 'ХК', 'ХН'] }
  ),
  'family-0154': rule(
    'LiYv',
    { 'Материал жилы': 'Лужёная медь', ...insulation, ...mounting },
    'https://www.helukabel.com/publication/DE/CATALOGUES/CW/Auswahltabellen_EN/Kap_K_284-323_en_link.pdf#page=4',
    { color: true, prefix: 'HELUKABEL', single: true }
  ),
  'family-0182': rule(
    'КГПэП',
    { ...shield, Назначение: 'Цепи управления и сигнализации' },
    hka + '#page=402',
    { requireHF: true }
  ),
  'family-0110': rule(
    'СБЗПу',
    {
      'Материал изоляции': 'Полиэтилен',
      'Заполнение сердечника': 'Гидрофобное',
      Назначение: 'Цепи сигнализации и блокировки',
    },
    hka + '#page=382'
  ),
  'family-0122': rule(
    'ПЭТВ-2',
    {
      ...copper,
      'Материал изоляции': 'Эмаль',
      Назначение: 'Обмотки электрических машин и аппаратов',
    },
    hka + '#page=539'
  ),
  'family-0063': rule(
    'АПвПу',
    {
      ...aluminum,
      ...power,
      ...shield,
      'Материал изоляции': 'Сшитый полиэтилен',
      'Материал оболочки': 'Полиэтилен',
    },
    hka + '#page=131',
    { modifiers: ['6/10КВ'] }
  ),
  'family-0043': rule(
    'ПВВ',
    {
      ...copper,
      ...power,
      'Материал изоляции': 'Сшитый полиэтилен',
      'Материал оболочки': pvc,
    },
    hka + '#page=137',
    { rejectHF: true }
  ),
  'family-0083': rule(
    'КУПЭВ',
    {
      ...shield,
      'Материал изоляции': 'Полиэтилен',
      'Материал оболочки': pvc,
      Назначение: 'Цепи управления',
    },
    hka + '#page=307',
    { modifiers: ['Э'], rejectHF: true }
  ),
  'family-0072': rule(
    'КГПП',
    { Назначение: 'Подключение промышленного оборудования' },
    hka + '#page=58',
    { requireHF: true, modifiers: ['Э'], screenedByIndex: true }
  ),
  'family-0308': rule(
    'КСРЭВ',
    { ...shield, ...signaling },
    'https://paritet.su/upload/iblock/bd7/Paritet_catalog_2026.pdf#page=144'
  ),
  'family-0146': rule(
    'КПСТВМ',
    {
      'Материал изоляции': 'Термоэластопласт',
      Назначение: 'Монтаж электрических цепей подвижного состава',
    },
    hka + '#page=491'
  ),
  'family-0071': rule(
    'КГН',
    {
      ...copper,
      'Материал оболочки': 'Резина',
      Назначение: 'Подключение передвижных механизмов к электрической сети',
    },
    hka + '#page=244'
  ),
  'family-0023': rule('СИП-4', air, hka + '#page=513'),
  'family-0177': rule(
    'ПВАМ',
    {
      ...copper,
      ...insulation,
      Назначение: 'Монтаж электрических цепей дорожных транспортных средств',
    },
    hka + '#page=562',
    { color: true, single: true }
  ),
  'family-0059': rule(
    'АПвПг',
    {
      ...aluminum,
      ...power,
      ...shield,
      'Материал изоляции': 'Сшитый полиэтилен',
      'Материал оболочки': 'Полиэтилен',
      Герметизация: 'Продольная',
    },
    hka + '#page=132'
  ),
  'family-0161': rule(
    'TRONIC-CY(LIY-CY)',
    { ...layers, ...shield, Назначение: 'Передача данных и сигналов' },
    'https://shop.helukabel.com/mx-en/tronic-cy-liy-cy-tronic-dy-liy-dy-m20139'
  ),
  'family-0216': rule(
    'КИПэВ',
    { ...shield, Назначение: 'Передача сигналов интерфейса RS-485' },
    'https://spetskabel.ru/f/1/global/pricelist/spetskabel-automation.pdf#page=44',
    { modifiers: ['Э'] }
  ),
  'family-0118': rule(
    'ПУГВВ',
    { ...copper, ...layers, ...install },
    hka + '#page=407',
    { rejectHF: true }
  ),
  'family-0544': rule(
    'ИнСил-ОЭ',
    { ...copper, ...shield, ...mounting },
    'https://ek-m.com/web/files_pdf/buk-ins-sud-2024.pdf#page=3',
    { modifiers: ['З'] }
  ),
  'family-0159': rule(
    'UNITRONIC LIYCY',
    { ...layers, ...shield, Назначение: 'Передача данных и сигналов' },
    'https://products.lappgroup.com/online-catalogue/data-communication-systems/low-frequency-data-transmission-cables/din-colour-code/unitronic-liycy.html?format=pdf#page=1'
  ),
  'family-0033': rule(
    'ПВВГ',
    { ...copper, ...power, 'Материал оболочки': pvc },
    hka + '#page=11',
    { rejectHF: true }
  ),
  'family-0145': rule(
    'КМЭП',
    { ...shield, Назначение: 'Монтаж электрических цепей подвижного состава' },
    hka + '#page=486'
  ),
  'family-0162': rule(
    'ELITRONIC-CY LIYCY',
    { ...layers, ...shield, Назначение: 'Передача данных и сигналов' },
    'https://tkd-kabel.de/datenblaetter/02/02.01.02.pdf#page=1'
  ),
  'family-0029': rule(
    'КВВБГ',
    { ...layers, ...steel, ...control },
    hka + '#page=193',
    { rejectHF: true }
  ),
  'family-0228': rule(
    'КИПВэВ',
    { ...shield, Назначение: 'Передача сигналов интерфейса RS-485' },
    'https://spetskabel.ru/f/1/global/pricelist/spetskabel-automation.pdf#page=45'
  ),
  'family-0242': rule(
    'КСБК',
    signaling,
    'https://spetskabel.ru/f/1/global/pricelist/spetskabel-automation.pdf#page=23'
  ),
  'family-0127': rule(
    'КМПЭВ',
    { ...shield, ...mounting },
    'https://podolskkabel.ru/upload/iblock/35c/9y2fgwn51tb8h9afgkf39h797g42y4xe.pdf#page=18',
    { modifiers: ['500', 'Э'], polyethylene: true, rejectHF: true }
  ),
  'family-0638': rule(
    'КУПР',
    {
      'Материал изоляции': 'Полиэтилен',
      'Материал оболочки': 'Резина',
      Назначение: 'Цепи управления',
    },
    'https://www.rkz.ru/f/1/RKZ_Katalog.pdf#page=34'
  ),
  'family-0113': rule('СИП-3', air, hka + '#page=513'),

  'family-0089': rule(
    'КВ',
    mounting,
    'https://www.gerda.ru/upload/iblock/fe6/fe6b070f95ef69191affe8a2571ae983.pdf#page=3',
    {
      prefix: 'ГЕРДА',
      requirePrefix: true,
      modifiers: ['Э'],
      screenedByIndex: true,
    }
  ),
  'family-0129': rule('НВ', { ...insulation, ...mounting }, hka + '#page=298', {
    color: true,
  }),
  'family-0143': rule(
    'НПП',
    { Назначение: 'Монтаж электрических цепей подвижного состава' },
    hka + '#page=486',
    {
      prefix: 'ТРАНСКАБ',
      color: true,
      modifiers: ['Э'],
      screenedByIndex: true,
      hfInsulation: true,
    }
  ),
  'family-0117': rule('ПуГП', { ...copper, ...install }, hka + '#page=414', {
    color: true,
    hfInsulation: true,
  }),
  'family-0065': rule(
    'АПвПу2Г',
    {
      ...aluminum,
      ...power,
      'Материал изоляции': 'Сшитый полиэтилен',
      'Материал оболочки': 'Полиэтилен',
      ...shield,
      Герметизация: 'Продольная и поперечная',
    },
    hka + '#page=133'
  ),
  'family-0151': rule(
    'H05V-K',
    { ...copper, ...insulation, ...install },
    'https://www.helukabel.com/publication/DE/CATALOGUES/CW/Auswahltabellen_EN/Kap_K_284-323_en_link.pdf#page=6',
    { color: true }
  ),
  'family-0108': rule(
    'ТСВ',
    { ...copper, Назначение: 'Соединения в телефонной станционной аппаратуре' },
    hka + '#page=356',
    { pvcLayers: true, modifiers: ['200'] }
  ),
  'family-0025': rule(
    'АКВВГ',
    { ...aluminum, ...control, Бронированный: 'Нет' },
    hka + '#page=193',
    { pvcLayers: true, modifiers: ['Э'], screenedByIndex: true }
  ),
  'family-0240': rule(
    'КСБ',
    signaling,
    'https://spetskabel.ru/f/1/global/pricelist/spetskabel-automation.pdf#page=15'
  ),
  'family-0034': rule(
    'АПвБШв',
    {
      ...aluminum,
      ...power,
      ...steel,
      'Материал изоляции': 'Сшитый полиэтилен',
      'Материал оболочки': pvc,
    },
    hka + '#page=18',
    { rejectHF: true }
  ),

  'family-0078': rule('МКЭШВ', { ...mounting, ...shield }, hka + '#page=294', {
    pvcLayers: true,
    aliases: ['МКЭШВл'],
    modifiers: ['Э', 'ЭА', 'ЭМ', 'ЭЭ', 'М', 'Л', 'З'],
  }),
  'family-0079': rule(
    'МКЭКШВ',
    { ...mounting, ...shield, ...wire },
    hka + '#page=294',
    { pvcLayers: true, aliases: ['МКЭКШВл'], modifiers: ['Э', 'ЭА', 'ЭМ', 'У'] }
  ),
  'family-0136': rule(
    'КПС',
    {
      Назначение:
        'Передача сигналов в системах охраны и противопожарной защиты',
    },
    hka + '#page=401',
    { prefix: 'СОББИТ', modifiers: ['Э'], screenedByIndex: true }
  ),
  'family-0068': rule(
    'ППГ',
    { ...power, ...copper, Бронированный: 'Нет' },
    hka + '#page=63',
    { requireHF: true, modifiers: ['ПЛОСКИЙ', 'Э'], screenedByIndex: true }
  ),
  'family-0541': rule(
    'КГ',
    {
      ...copper,
      Назначение: 'Подключение передвижных механизмов к электрической сети',
    },
    'https://www.zvetlit.ru/kabeli-silovye/kabeli-silovye-gibkie/kgtp',
    { modifiers: ['ТП'], required: 'ТП', thermoplastic: true }
  ),
  'family-0090': rule(
    'КВК',
    { ...mounting, ...wire },
    'https://www.gerda.ru/upload/iblock/fe6/fe6b070f95ef69191affe8a2571ae983.pdf#page=3',
    {
      prefix: 'ГЕРДА',
      requirePrefix: true,
      modifiers: ['Э', 'ЭХЛ'],
      screenedByIndex: true,
    }
  ),
  'family-0087': rule(
    'КУИН',
    {
      ...copper,
      Назначение: 'Цепи управления, контроля и межприборные соединения',
    },
    'https://kubancabel.ru/upload/Catalog.pdf#page=66',
    { constructorCode: true }
  ),
  'family-0080': rule(
    'МГШВ',
    {
      'Материал изоляции': 'Комбинированная волокнистая и ПВХ изоляция',
      ...mounting,
    },
    podolsk + '#page=8',
    { color: true, modifiers: ['Э'], screenedByIndex: true }
  ),
  'family-0021': rule(
    'ТППэп',
    {
      ...copper,
      'Материал изоляции': 'Полиэтилен',
      ...shield,
      Назначение: 'Телефонные линии связи',
    },
    'https://www.samaracable.ru/upload/catalog.pdf#page=95',
    { modifiers: ['200', '315'], sheathByToken: true }
  ),
  'family-0020': rule('МКЭШ', { ...mounting, ...shield }, podolsk + '#page=9', {
    pvcLayers: true,
    modifiers: ['Э', 'Л'],
  }),
  'family-0139': rule(
    'КВКБШВ',
    { ...copper, ...control, ...wire },
    'https://podolskkabel.ru/upload/iblock/b06/vlsu77w3bumycj1l0luibfiu3qc185cg.pdf#page=15',
    { pvcLayers: true }
  ),
  'family-0019': rule('МКШ', mounting, podolsk + '#page=9', {
    pvcLayers: true,
  }),
  'family-0086': rule(
    'КУВШ',
    { ...copper, Назначение: 'Цепи управления и контроля' },
    hka + '#page=308',
    {
      prefix: 'НИКИ',
      pvcLayers: true,
      modifiers: ['ЭМ', 'С', 'Э', 'ЭФ'],
      screenedByIndex: true,
    }
  ),
  'family-0018': rule(
    'H07V-K',
    { ...copper, ...insulation, ...install },
    'https://www.helukabel.com/publication/DE/CATALOGUES/CW/Auswahltabellen_EN/Kap_K_284-323_en_link.pdf#page=8',
    { color: true }
  ),
  'family-0012': rule(
    'КГВЭВ',
    { ...shield, Назначение: 'Подключение промышленного оборудования' },
    hka + '#page=32',
    { pvcLayers: true, modifiers: ['Э'] }
  ),
  'family-0022': rule(
    'СИП-2',
    air,
    'https://kamkabel.ru/upload/iblock/a48/mbst3jr07q5tnw3p91vlh5bk2trxpiga.pdf#page=129',
    { modifiers: ['0.6/1', '0,6/1', '0,6/1КВ'], sip: true }
  ),
  'family-0166': rule('КВБбШ', { ...control, ...steel }, hka + '#page=197', {
    pvcInsulation: true,
  }),
  'family-0135': rule(
    'КПСВэВ',
    { ...signaling, ...shield },
    spec + '#page=60',
    { pvcLayers: true }
  ),
  'family-0152': rule(
    'NYM',
    { ...copper, ...layers, ...install },
    'https://products.lappgroup.com/online-catalogue/power-and-control-cables/building-installation/vde-standard-cables/nym-j.html?format=pdf#page=1',
    { aliases: ['NYМ'], modifiers: ['J', 'O'], nym: true }
  ),
  'family-0134': rule('КПСВВ', signaling, spec + '#page=59', {
    pvcLayers: true,
  }),
  'family-0114': rule(
    'АПВ',
    { ...aluminum, ...insulation, ...install },
    'https://energoprom.net.ua/ru/production/catalog/ustanovochnie/apv/',
    { color: true }
  ),
  'family-0132': rule(
    'НВ4',
    { 'Материал жилы': 'Лужёная медь', ...insulation, ...mounting },
    'https://energoprom.net.ua/ru/production/catalog/izolirovannie/polivinilhlorid/nv/',
    { color: true }
  ),
  'family-0070': rule(
    'КППГ',
    { ...copper, ...control, Бронированный: 'Нет' },
    hka + '#page=215',
    { requireHF: true, modifiers: ['Э'], screenedByIndex: true }
  ),
  'family-0164': rule(
    'OLFLEXclassic 110',
    {
      ...copper,
      ...layers,
      Назначение: 'Цепи питания и управления оборудования',
    },
    'https://products.lappgroup.com/online-catalogue/power-and-control-cables/various-applications/pvc-outer-sheath-and-numbered-cores/oelflex-classic-110.html'
  ),
  'family-0123': rule(
    'КМПВ',
    mounting,
    'https://podolskkabel.ru/upload/iblock/35c/9y2fgwn51tb8h9afgkf39h797g42y4xe.pdf#page=4',
    { modifiers: ['Э', '500'], polyethylene: true, screenedByIndex: true }
  ),
  'family-0490': rule(
    'ААШв',
    {
      ...aluminum,
      ...power,
      'Материал изоляции': 'Пропитанная бумага',
      'Материал оболочки': 'Алюминий',
      'Защитный шланг': 'ПВХ',
    },
    'https://kamkabel.ru/upload/iblock/a48/mbst3jr07q5tnw3p91vlh5bk2trxpiga.pdf#page=5',
    { aliases: ['ААШв- 1', 'ААШв- 6', 'ААШв-10'] }
  ),
  'family-0133': rule(
    'КСВВ',
    signaling,
    'https://paritet.su/upload/iblock/bd7/Paritet_catalog_2026.pdf#page=9',
    { pvcLayers: true }
  ),
  'family-0027': rule(
    'КВБШв',
    { ...copper, ...control, ...steel },
    'https://expert-cable.ru/upload/nomenclature-2021.pdf#page=126',
    { pvcLayers: true }
  ),
  'family-0583': rule(
    'КМПВ',
    { ...mounting, ...shield },
    'https://podolskkabel.ru/upload/iblock/35c/9y2fgwn51tb8h9afgkf39h797g42y4xe.pdf#page=4',
    { aliases: ['КМПВЭ'], modifiers: ['Э', '500'], polyethylene: true }
  ),
  'family-0074': rule(
    'РПШ',
    {
      'Материал изоляции': 'Резина',
      'Материал оболочки': 'Резина',
      Назначение: 'Подключение электрического оборудования',
    },
    hka + '#page=551',
    { modifiers: ['Э'], screenedByIndex: true }
  ),
};

const normalize = (value) =>
  String(value ?? '')
    .toUpperCase()
    .replace(/[\s-]/gu, '')
    .replace('(A)', '(А)');
const firePattern = /^НГ(?:\([АБВГДС]\))?(?:FR)?(?:LS|HF)?(?:LTX)?(?:ХЛ)?$/u;

export function getAdditionalFamilyPlan(product, decoded) {
  const profile = additionalProfiles[decoded?.familyRecordId];
  if (!profile) return null;
  const problem = (reason) => ({ profile, reason });
  const marks = [profile.mark, ...(profile.aliases || [])].map(normalize);
  const mark = normalize(product.mark);
  const source = normalize(product.sourceName);
  if (
    isProductPending(product) ||
    decoded.status !== 'reviewed' ||
    decoded.unknown?.length ||
    decoded.warnings?.length ||
    product.parsingWarnings?.length
  )
    return problem(
      'Неполная или противоречивая расшифровка. Требуется проверить полную заводскую маркировку.'
    );
  const exactPrefix = [mark, ...marks].some(
    (m) =>
      m &&
      (source.startsWith(m) ||
        (profile.prefix && source.startsWith(profile.prefix + m)))
  );
  if (
    !(marks.includes(mark) || profile.markPattern?.test(mark)) ||
    !exactPrefix ||
    (profile.requirePrefix && !source.startsWith(profile.prefix + mark))
  )
    return problem(
      'Складское название не подтверждает точную марку или серию.'
    );
  if (profile.single && (product.cores > 1 || product.groupCores > 1))
    return problem(
      'Размерная запись противоречит одножильной конструкции. Нужен ярлык поставщика.'
    );
  const tokens = decoded.tokens || [];
  const attributes = (product.attributes || []).map(normalize);
  const colors = profile.color
    ? tokens
        .filter((t) => t.text.startsWith('Цвет в исходной записи:'))
        .map((t) => normalize(t.code))
    : [];
  const fire = attributes.filter((x) => firePattern.test(x));
  const extras = attributes.filter((x) => !firePattern.test(x) && x !== 'ХЛ');
  if (
    fire.length > 1 ||
    extras.some(
      (x) =>
        !profile.modifiers?.includes(x) &&
        !colors.includes(x) &&
        !(
          profile.constructorCode &&
          tokens.some(
            (t) => normalize(t.code) === x && /изоляц|экран|брон/u.test(t.text)
          )
        )
    )
  )
    return problem(
      'Есть дополнительный индекс вне проверенной области семейства: ' +
        (extras.join(', ') || attributes.join(', ')) +
        '.'
    );
  if (profile.required && !attributes.includes(profile.required))
    return problem('Отсутствует обязательный индекс ' + profile.required + '.');
  const index = fire[0] || '';
  if (profile.requiredFire && index !== profile.requiredFire)
    return problem('Пожарное исполнение отличается от проверенного.');
  if (profile.requireHF && !index.includes('HF'))
    return problem(
      'Безгалогенная конструкция не подтверждена для указанного индекса.'
    );
  const variant = {};
  if (index) {
    const token = tokens.find((t) => normalize(t.code) === index);
    if (!token || !source.includes(index))
      return problem(
        'Пожарный индекс в названии и проверенной расшифровке не совпадает.'
      );
    const category = /\(([АБВГДС])\)/u.exec(index)?.[1];
    variant['Нераспространение горения'] = category
      ? 'При групповой прокладке, категория ' + category
      : 'Индекс нг, категория не указана';
    if (index.includes('LS')) variant['Дымо- и газовыделение'] = 'Пониженное';
    if (index.includes('FR')) variant['Огнестойкое исполнение'] = 'Да';
    if (index.includes('HF')) variant['Безгалогенное исполнение'] = 'Да';
    if (index.includes('LTX'))
      variant['Токсичность продуктов горения'] = 'Пониженная';
  }
  if (index.endsWith('ХЛ') || attributes.includes('ХЛ'))
    variant['Климатическое исполнение'] = 'ХЛ (холодостойкое)';
  if (
    profile.screenedByIndex &&
    extras.some((x) => ['Э', 'ЭХЛ', 'ЭМ', 'ЭФ'].includes(x))
  )
    variant['Экранированный'] = 'Да';
  if (profile.nym && extras.includes('J'))
    variant['Защитная жила'] = 'Зелёно-жёлтая жила';
  if (profile.nym && extras.includes('O'))
    variant['Защитная жила'] = 'Без зелёно-жёлтой жилы';
  if (profile.sip) variant['Несущая нулевая жила'] = 'Изолированная';
  const mountingHf =
    ['family-0078', 'family-0079'].includes(decoded.familyRecordId) &&
    /^МКЭ(?:К)?ШВ\s+нг\([АA]\)\s*-?(?:FR)?HF\s+\d+\s*[xх×]\s*\d+(?:\s*[xх×]\s*\d+)?(?:[.,]\d+)?$/iu.test(
      product.sourceName.trim()
    ) &&
    ['НГ(А)HF', 'НГ(А)FRHF'].includes(index);
  if (mountingHf) {
    variant['Материал оболочки'] = hf['Материал оболочки'];
    if (!index.includes('FR'))
      variant['Материал изоляции'] = hf['Материал изоляции'];
  }
  if (profile.pvcLayers && index.includes('HF') && !mountingHf)
    return problem(
      'Безгалогенное исполнение требует отдельного подтверждения материалов. Базовые ПВХ-слои не перенесены.'
    );
  if (profile.rejectHF && index.includes('HF'))
    return problem(
      'Материал оболочки для безгалогенного исполнения требует уточнения.'
    );
  if (profile.hfInsulation && index.includes('HF'))
    variant['Материал изоляции'] = hf['Материал изоляции'];
  if (profile.requireHF) Object.assign(variant, hf);
  if (profile.thermoplastic)
    Object.assign(variant, {
      'Материал оболочки': 'Термоэластопласт',
      ...(product.cores > 1 && { 'Материал изоляции': 'Термоэластопласт' }),
    });
  if (profile.sheathByToken && index.includes('HF'))
    variant['Материал оболочки'] = 'Безгалогенная полимерная композиция';
  if (profile.polyethylene)
    Object.assign(variant, {
      'Материал изоляции': 'Полиэтилен',
      'Материал оболочки': pvc,
    });
  const specs = {
    ...profile.specs,
    ...(profile.pvcLayers && !mountingHf
      ? layers
      : profile.pvcInsulation
        ? insulation
        : {}),
  };
  const conflicts = Object.entries({ ...specs, ...variant }).filter(
    ([k, v]) => {
      const current = product.specs?.[k];
      return (
        current != null &&
        current !== v &&
        k !== 'Назначение' &&
        !(
          v === pvc &&
          /^ПВХ-пластикат пониженной пожарной опасности$/u.test(current)
        ) &&
        !(
          v === hf['Материал изоляции'] &&
          current === 'Основной слой — ' + v.toLowerCase()
        )
      );
    }
  );
  return {
    profile: mountingHf
      ? { ...profile, source: 'https://www.mpkabel.ru/catalog.pdf' }
      : profile,
    specs,
    variant,
    mountingHf,
    conflicts: conflicts.map(([key]) => key),
  };
}

export function applyCatalogAdditionalProfiles(product, decoded) {
  const plan = getAdditionalFamilyPlan(product, decoded);
  if (!plan || plan.reason) return product;
  return {
    ...product,
    specs: {
      ...product.specs,
      ...Object.fromEntries(
        Object.entries({ ...plan.specs, ...plan.variant }).filter(
          ([key]) =>
            product.specs?.[key] == null &&
            !(
              key === 'Тип брони' && plan.conflicts.includes('Бронированный')
            ) &&
            !(key === 'Бронированный' && plan.conflicts.includes('Тип брони'))
        )
      ),
    },
  };
}
