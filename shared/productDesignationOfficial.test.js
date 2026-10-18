import { describe, expect, it } from 'vitest';
import { buildProductDesignation } from './productDesignation.js';
import { enrichPriceDesignations } from './productDesignationBatch.js';
import knowledge from './designationKnowledgeBase.json' with { type: 'json' };

const product = (mark, sourceName, attributes = []) => ({
  mark,
  sourceName,
  attributes,
});
const text = (d) => [d.description, ...d.tokens.map((t) => t.text)].join(' ');

describe('official manufacturer decoding', () => {
  it('keeps the low-voltage ПвПГ separate from the sealed medium-voltage ПвПг, including attached fire suffixes', () => {
    for (const p of [
      product('ПвПГ', 'ПвПГ 3х1,5 нг(А)HF', ['нг(А)HF']),
      product('ПвПГнг(А)-HF', 'ПвПГнг(А)-HF 3х2,5'),
      product('ПвПГнг(А)-FRHF', 'ПвПГнг(А)-FRHF 3х2,5'),
    ]) {
      const d = buildProductDesignation(p);
      expect(d.family).toBe('ПвПГ');
      expect(text(d)).toContain('Без защитного покрова');
      expect(text(d)).toContain(
        'Оболочка из полимерной композиции без галогенов'
      );
      expect(text(d)).not.toContain('герметизация');
      expect(text(d)).not.toContain('Полиэтиленовая оболочка');
      expect(d.officialComplete).toBe(true);
    }
    expect(
      text(buildProductDesignation(product('ПвПг', 'ПвПг 1х95/16-10')))
    ).toContain('Продольная герметизация');
    expect(
      buildProductDesignation(product('ПВПГ', 'ПВПГ 3х1,5 нг(А)HF')).family
    ).toBeNull();
  });

  it('uses the documented KVIP diameter and section series without guessing unknown sizes', () => {
    for (const [size, quantity] of [
      ['0,64', 'диаметр жилы 0,64 мм'],
      ['0,5', 'сечение каждой жилы 0,5 мм²'],
      ['1,2', 'сечение каждой жилы 1,2 мм²'],
    ]) {
      const d = buildProductDesignation(product('КВИП', `КВИП 1х2х${size}`));
      expect(text(d)).toContain(quantity);
      expect(d.officialComplete).toBe(true);
    }
    const unknown = buildProductDesignation(product('КВИП', 'КВИП 1х2х0,6'));
    expect(unknown.status).toBe('partial');
    expect(unknown.officialComplete).toBe(false);
  });

  it('does not assign diameter units to undocumented signal-cable nominals', () => {
    for (const [mark, size] of [
      ['КСВВ', '1'],
      ['КСРВ', '0,2'],
      ['КСРВ', '1,5'],
      ['КСРЭВ', '0,75'],
    ]) {
      const d = buildProductDesignation(product(mark, `${mark} 1х2х${size}`));
      expect(d.status).toBe('partial');
      expect(d.officialComplete).toBe(false);
      expect(text(d)).not.toContain('диаметр жилы');
    }
    expect(
      text(buildProductDesignation(product('КСВВ', 'КСВВ 4х0,5')))
    ).toContain('диаметр жилы 0,5 мм');
    expect(
      buildProductDesignation(product('КСВВ', 'КСВВ 1х0,5')).officialComplete
    ).toBe(false);
    expect(
      buildProductDesignation(product('КСВВ', 'КСВВ 1х2х0,5')).officialComplete
    ).toBe(true);
    expect(
      text(buildProductDesignation(product('КСРВ', 'КСРВ 1х2х0,8')))
    ).toContain('диаметр жилы 0,8 мм');
  });

  it('does not turn probable signal-family mixups into square-millimetre claims', () => {
    for (const [mark, size] of [
      ['КПСВВ', '0,8'],
      ['КПСВэВ', '1,38'],
    ]) {
      const d = buildProductDesignation(product(mark, `${mark} 2х2х${size}`));
      expect(d.officialComplete).toBe(false);
      expect(text(d)).not.toContain('сечение каждой жилы');
    }
    expect(
      text(buildProductDesignation(product('КПСВВ', 'КПСВВ 2х2х0,5')))
    ).toContain('сечение каждой жилы 0,5 мм²');
  });

  it('does not reuse a PE base sheath as proof for an HF execution', () => {
    const d = buildProductDesignation(
      product('АПвП', 'АПвП 3х120/50-10 нг(А)HF', ['10', 'нг(А)HF'])
    );
    expect(d.status).toBe('partial');
    expect(d.officialComplete).toBe(false);
    expect(text(d)).not.toContain('Полиэтиленовая оболочка');
    expect(text(d)).toContain('Изоляция из сшитого полиэтилена');
  });

  it('binds the ELITRONIC trademark to its TKD technical sheet', () => {
    const d = buildProductDesignation(
      product('ELITRONIC-CY LIYCY', 'ELITRONIC-CY LIYCY 12х0,5')
    );
    expect(d.evidence.documentId).toBe('tkd-elitronic');
    expect(d.sources[0].url).toContain('tkd-kabel.de');
    expect(d.officialComplete).toBe(true);
  });

  it('persists the scope of family cross-checks without presenting it as full product verification', () => {
    const d = buildProductDesignation(product('ВВГ', 'ВВГ 3х2,5'));
    expect(d.crossCheck.status).toBe('confirmed-independent');
    expect(d.crossCheck.scope).toBe('base-family');
    expect(d.crossCheck.coversFullDesignation).toBe(false);
    const unsupported = buildProductDesignation(
      product('ВВГ', 'ВВГ 3х2,5', ['XYZ'])
    );
    expect(unsupported.crossCheck.id).toBe(d.crossCheck.id);
    expect(unsupported.officialComplete).toBe(false);
  });

  it('uses the separate thermoplastic construction, including a future import with separated attributes', () => {
    for (const p of [
      product('КГ', 'КГ 3х2,5 тп хл', ['тп', 'ХЛ']),
      product('КГтп', 'КГтп-ХЛ 3х2,5'),
    ]) {
      const d = buildProductDesignation(p);
      expect(d.family).toBe('КГтп');
      expect(text(d)).toContain('термоэластопласта');
      expect(text(d)).not.toContain('резин');
      expect(d.officialComplete).toBe(true);
    }
  });

  it('abstains when an importer separated an unsupported suffix from the original mark', () => {
    const d = buildProductDesignation(product('КММ', 'КММЭф 3х0,35', ['ЭФ']));
    expect(d.family).toBeNull();
    expect(d.officialComplete).toBe(false);
    expect(text(d)).not.toContain('ПВХ');
  });

  it('does not invent a unit for an undocumented KPS nominal', () => {
    const d = buildProductDesignation(
      product('КПС', 'КПС 1х2х0,78 нг(А)-FRLS')
    );
    expect(d.status).toBe('partial');
    expect(d.officialComplete).toBe(false);
    expect(text(d)).not.toContain('0,78 мм²');
  });

  it('resolves the two different documented dimensional quantities of KPЭTI', () => {
    const area = buildProductDesignation(
      product('КПЭТИ', 'КПЭТИ нг(В)-FRHF 7х2х0,35')
    );
    const diameter = buildProductDesignation(
      product('КПЭТИ', 'КПЭТИ нг(В)-FRHF 2х2х0,7')
    );
    const unknown = buildProductDesignation(product('КПЭТИ', 'КПЭТИ 2х2х0,52'));
    expect(text(area)).toContain('сечение каждой жилы 0,35 мм²');
    expect(text(diameter)).toContain('диаметр жилы 0,7 мм');
    expect(area.officialComplete).toBe(true);
    expect(diameter.officialComplete).toBe(true);
    expect(unknown.officialComplete).toBe(false);
  });

  it('consumes the entire manufacturer constructor and preserves unknown tails', () => {
    const d = buildProductDesignation(
      product('КУИН', 'КУИН 3х2х1 ВЭК-хл', ['ВЭК-хл'])
    );
    expect(d.officialComplete).toBe(true);
    expect(text(d)).toContain('Изоляция и оболочка из ПВХ');
    expect(text(d)).toContain('Общий экран');
    expect(text(d)).toContain('Броня');
    const unknown = buildProductDesignation(
      product('КУИН', 'КУИН 3х2х1 ВЭКXYZ', ['ВЭКXYZ'])
    );
    expect(unknown.unknown).toContain('ВЭКXYZ');
    expect(unknown.officialComplete).toBe(false);
    expect(
      buildProductDesignation(product('КГ', 'КГ 3х1 ВЭК', ['ВЭК'])).unknown
    ).toContain('ВЭК');
  });

  it('uses the official HF telephone execution instead of copying the PE sheath of the base type', () => {
    const d = buildProductDesignation(
      product('ТППэп', 'ТППэп 10х2х0,5-200 нг(А)HF', ['200', 'нг(А)-HF'])
    );
    expect(d.officialComplete).toBe(true);
    expect(d.evidence.documentId).toBe('samara-catalog');
    expect(text(d)).toContain('Сплошная полиэтиленовая изоляция');
    expect(text(d)).toContain('Полимерная композиция без галогенов');
    expect(text(d)).toContain('200 В постоянного тока');
    expect(text(d)).not.toContain('200 кВ');
    expect(
      text(buildProductDesignation(product('ТППэп', 'ТППэп 10х2х0,5')))
    ).toContain('Полиэтилен');
  });

  it('allows scoped numerical voltages without treating arbitrary attributes as voltages', () => {
    expect(
      buildProductDesignation(product('АПвПу2г', 'АПвПу2г 1х95/16-10', ['10']))
        .officialComplete
    ).toBe(true);
    expect(
      buildProductDesignation(product('КГ', 'КГ 3х1 10', ['10'])).unknown
    ).toContain('10');
  });

  it('does not confuse the uppercase silicone wire with the different mixed-case power designation', () => {
    expect(
      buildProductDesignation({ mark: 'ПВКВ', sourceName: 'ПВКВ 1х2,5' })
        .officialComplete
    ).toBe(true);
    expect(
      buildProductDesignation({ mark: 'ПвКВ', sourceName: 'ПвКВ 1х95' }).family
    ).toBeNull();
  });

  it('excludes complex configurations from complete coverage', () => {
    const d = buildProductDesignation({
      mark: 'КГЭШ',
      sourceName: 'КГЭШ 3х16+1х10+1х6 6кВ',
      conductorConfiguration: '3х16+1х10+1х6',
      cores: 3,
      crossSection: 16,
    });
    expect(d.status).toBe('partial');
    expect(d.officialComplete).toBe(false);
  });

  it('recognizes the hyphenated LTx spelling while retaining the brand gate', () => {
    const p = {
      ...product('30', 'Лоутокс 30 нг(А)FRLSLTx 2х2х0,52', ['нг(А)-FRLS-LTx']),
      brand: 'ЛОУТОКС',
    };
    expect(buildProductDesignation(p).officialComplete).toBe(true);
    expect(
      buildProductDesignation(product('30', '30 2х2х0,52')).officialComplete
    ).toBe(false);
  });

  it('keeps the universal SKAB purpose and does not duplicate the cold fire index', () => {
    const skab = buildProductDesignation(
      product('СКАБ 250К', 'СКАБ 250К 6х2х1л нг(А)LS', ['л', 'нг(А)-LS'])
    );
    expect(text(skab)).toContain('КИПиА');
    expect(text(skab)).not.toContain('Судовой');
    const cold = buildProductDesignation(
      product('ВВГ', 'ВВГ 3х1,5 нг(А)-LS хл', ['нг(А)-LS-ХЛ'])
    );
    expect(cold.tokens.filter((t) => t.code.startsWith('нг'))).toHaveLength(1);
  });

  it('keeps source evidence auditable and does not count legacy unsourced reviewed descriptions', () => {
    expect(new Set(knowledge.documents.map((d) => d.url)).size).toBe(
      knowledge.documents.length
    );
    expect(new Set(knowledge.families.map((f) => f.id)).size).toBe(
      knowledge.families.length
    );
    for (const f of knowledge.families) {
      if (!f.evidence) continue;
      const doc = knowledge.documents.find(
        (d) => d.id === f.evidence.documentId
      );
      expect(doc, f.mark).toBeDefined();
      for (const page of f.evidence.pages || [])
        expect(page, `${f.mark}: ${page}`).toBeLessThanOrEqual(
          doc.pages || Infinity
        );
    }
    const legacy = buildProductDesignation(product('КВБбШ', 'КВБбШ 4х1'));
    expect(legacy.officialComplete).toBe(false);
  });

  it('separates aluminium and steel areas in AS wire without interpreting the steel as a screen', () => {
    const d = buildProductDesignation(product('АС 70/11', 'АС 70/11'));
    expect(d.officialComplete).toBe(true);
    expect(text(d)).toContain('алюминиевой части 70 мм²');
    expect(text(d)).toContain('стального сердечника 11 мм²');
    expect(text(d)).not.toContain('сечение экрана');
    expect(
      buildProductDesignation(product('АС 70/11XYZ', 'АС 70/11XYZ'))
        .officialComplete
    ).toBe(false);
  });

  it('checks the factory single-core PAV range and retains unknown price notes', () => {
    const valid = buildProductDesignation(
      product('ПАВ 1х16 желт-зел (АПВ)', 'ПАВ 1х16 желт-зел (АПВ)')
    );
    expect(valid.officialComplete).toBe(true);
    expect(text(valid)).toContain('Одна жила; номинальное сечение 16 мм²');
    expect(
      buildProductDesignation(product('ПАВ 2х4', 'ПАВ 2х4')).officialComplete
    ).toBe(false);
    const unknown = buildProductDesignation(
      product('ПАВ 1х16 XYZ', 'ПАВ 1х16 XYZ')
    );
    expect(unknown.unknown).toContain('XYZ');
    expect(unknown.officialComplete).toBe(false);
  });

  it('decodes the factory SIP phase, neutral and additional conductor configuration', () => {
    const d = buildProductDesignation(
      product('СИП-2', 'СИП-2 3х70+1х54.6+2х16 0,6/1', ['0,6/1'])
    );
    expect(d.officialComplete).toBe(true);
    expect(text(d)).toContain('Фазные жилы: 3 × 70 мм²');
    expect(text(d)).toContain('нулевая несущая жила: 1 × 54,6 мм²');
    expect(text(d)).toContain('Дополнительные жилы: 2 × 16 мм²');
    expect(
      buildProductDesignation(product('СИП-2', 'СИП-2 3х70+1х54.6+4х16'))
        .officialComplete
    ).toBe(false);
  });

  it('keeps factory-specific materials and model identity for new imports', () => {
    const pur = buildProductDesignation(
      product('Topflex 611-PUR', 'HELUKABEL Topflex 611-PUR 4х2.5')
    );
    expect(pur.officialComplete).toBe(true);
    expect(text(pur)).toContain('Полипропилен');
    expect(text(pur)).toContain('полиуретана');
    const wrongBrand = buildProductDesignation(
      product('Topflex 611-PUR', 'UNKNOWN Topflex 611-PUR 4х2.5')
    );
    expect(wrongBrand.officialComplete).toBe(false);
    const ktf = buildProductDesignation(product('КТФ', 'КТФЭ 5х1.5', ['Э']));
    expect(ktf.officialComplete).toBe(true);
    expect(
      buildProductDesignation(product('КТФ', 'КТФ 5х1.5')).officialComplete
    ).toBe(false);
    const km = buildProductDesignation(
      product('КМПВ', 'КМПВ 2х0.5-500', ['500'])
    );
    expect(km.officialComplete).toBe(true);
    expect(text(km)).toContain('Номинальное напряжение 500 В');
    expect(text(km)).not.toContain('500 кВ');
  });

  it('uses the NIKI light-resistance index and checks both grouped size spellings', () => {
    const d = buildProductDesignation(product('КУВШ', 'КУВШ 2х(2х1) С', ['С']));
    expect(d.officialComplete).toBe(true);
    expect(text(d)).toContain('светостойкость');
    expect(text(d)).not.toContain('слюд');
    for (const size of ['5х(4х1)', '5х4х1', '2х(4х2.5)', '2х4х2.5']) {
      expect(
        buildProductDesignation(product('КУВШ', `КУВШ ${size}`))
          .officialComplete
      ).toBe(false);
    }
  });

  it('checks the thermocouple alloy size combination and consumes the complete compound size', () => {
    const d = buildProductDesignation(product('ПТВО-М', 'ПТВО-М 1х1+1х2.5'));
    expect(d.officialComplete).toBe(true);
    expect(text(d)).toContain('ПВХ-оболочка');
    expect(text(d)).not.toContain('полиэфир');
    expect(text(d)).toContain(
      'Группа 2: 1 жил; номинальное сечение каждой жилы 2,5 мм²'
    );
    for (const size of ['1х0.5+1х0.75', '1х1.13+1х1.13', '1х0.75+1х1+1х2.5']) {
      expect(
        buildProductDesignation(product('ПТВ-М', `ПТВ-М ${size}`))
          .officialComplete
      ).toBe(false);
    }
    expect(
      buildProductDesignation(product('КМТВэВ', 'КМТВэВ 4х1+7х2.5 М', ['М']))
        .officialComplete
    ).toBe(false);
  });

  it('distinguishes individual and overall screens using the literal factory case', () => {
    const individual = buildProductDesignation(
      product('МКЭШВ', 'МКЭШВ 2х2х1 эа', ['ЭА'])
    );
    const overall = buildProductDesignation(
      product('МКЭШВ', 'МКЭШВ 2х2х1 Эа', ['ЭА'])
    );
    expect(text(individual)).toContain('Индивидуальные экраны пар');
    expect(text(overall)).toContain('Общий экран из алюмофлекса');
    expect(text(individual)).not.toContain('Общий экран из алюмофлекса');
  });

  it('does not infer an HF construction without the required execution or turn diameter into section', () => {
    const d = buildProductDesignation(
      product('КИПэБ', 'КИПэБ 2х2х0.6 нг(А)HF')
    );
    expect(d.officialComplete).toBe(true);
    expect(text(d)).toContain('диаметр жилы 0,6 мм');
    expect(text(d)).not.toContain('сечение каждой жилы');
    expect(
      buildProductDesignation(product('КИПэБ', 'КИПэБ 2х2х0.6'))
        .officialComplete
    ).toBe(false);
    expect(
      buildProductDesignation(product('КИПэБ', 'КИПэБ 2х2х0.5 нг(А)HF'))
        .officialComplete
    ).toBe(false);
  });

  it('retains official purpose text without claiming a complete construction or stock manufacturer', () => {
    const p = product('КГВБШв', 'КГВБШв 3х1.5 нг(А)LS');
    const { products } = enrichPriceDesignations([
      { ...p, sku: 'future-purpose', price: 73 },
    ]);
    const d = products[0].designationDecoded;
    expect(d.status).toBe('partial');
    expect(d.officialComplete).toBe(false);
    expect(d.manufacturerTexts).toHaveLength(1);
    expect(d.manufacturerTexts[0].text).toContain('минимальное сечение 10 мм²');
    expect(products[0].manufacturer).toBeUndefined();
    const doc = knowledge.documents.find(
      (item) => item.id === d.manufacturerTexts[0].documentId
    );
    expect(doc.hostingType).toBe('technical-library-copy');
    expect(doc.independentOfManufacturer).toBe(false);
  });

  it('reports strict coverage over all rows and preserves commercial fields', () => {
    const input = [
      {
        ...product('КГ', 'КГ 3х1 тп', ['тп']),
        sku: 'future-1',
        price: 123.45,
        stock: 87,
      },
      { ...product('НЕИЗВЕСТНО', 'НЕИЗВЕСТНО 3х1'), sku: 'future-2' },
    ];
    const { products, report } = enrichPriceDesignations(input);
    const { designationDecoded, ...original } = products[0];
    expect(original).toEqual(input[0]);
    expect(report.counts.officialComplete).toBe(1);
    expect(report.officialPending.map((p) => p.sku)).toEqual(['future-2']);
    expect(report.officialCoverage).toMatchObject({
      numerator: 1,
      denominator: 2,
      percent: 50,
      targetMet: false,
    });
    expect(designationDecoded.officialComplete).toBe(true);
  });
});
