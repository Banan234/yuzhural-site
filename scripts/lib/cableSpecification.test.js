import { describe, expect, test } from 'vitest';
import { findCableSpecification } from './cableSpecification.js';

test.each([
  ['OLFLEX SERVO 2YSLCYK-JB 3x25+3g4', '3х25+3g4', null],
  ['CARDIFF CABLE YY-JB 5G2.5', '5G2.5', 2.5],
  ['AT-(ZN)HBH 2g62.5/125 STB900 2.5', '2g62.5/125', null],
])(
  'preserves G notation without truncating the configuration: %s',
  (source, configuration, crossSection) => {
    expect(findCableSpecification(source)).toMatchObject({
      configuration,
      crossSection,
      warnings: [],
    });
  }
);

function parseSpan(source, span, expected) {
  const result = findCableSpecification(source);
  expect(result).not.toBeNull();
  expect(source.slice(result.index, result.index + result.length)).toBe(span);
  expect(result.index).toBe(source.indexOf(span));
  expect(result).toMatchObject(expected);
  return result;
}

describe('findCableSpecification', () => {
  test.each([
    '3x2.5',
    '3X2,5',
    '3\u04452,5',
    '3\u04252.5',
    '3\u00d72.5',
    '3 x 2.5',
  ])('keeps the plain specification contract: %s', (span) => {
    expect(parseSpan(`CABLE ${span} 0.66kV`, span, {})).toEqual({
      index: 6,
      length: span.length,
      configuration: null,
      cores: 3,
      groupCores: null,
      crossSection: 2.5,
      groundCores: null,
      groundSection: null,
      attributes: [],
      warnings: [],
    });
  });

  test('retains legacy ground fields for exactly two plain terms', () => {
    parseSpan('CABLE 3x2,5 + 1x1.5 suffix', '3x2,5 + 1x1.5', {
      configuration: null,
      cores: 3,
      crossSection: 2.5,
      groupCores: null,
      groundCores: 1,
      groundSection: 1.5,
      warnings: [],
    });
  });

  test.each([
    ['2X2x0.32', '2\u04452\u04450.32', 2, 2, 0.32],
    [
      '4x(2x0,5\u043c\u043a\u043b1)',
      '4\u0445(2\u04450,5\u043c\u043a\u043b1)',
      4,
      2,
      0.5,
    ],
    ['2x(2x1\u043c)', '2\u0445(2\u04451\u043c)', 2, 2, 1],
    ['8x(2x1)x0.5', '8\u0445(2\u04451)\u04450.5', 8, null, 0.5],
    ['8 x (2 + 1) x 0,4', '8\u0445(2+1)\u04450,4', 8, null, 0.4],
    ['1x240/25', '1\u0445240/25', 1, null, 240],
  ])(
    'parses complete structured dimensions: %s',
    (span, configuration, cores, groupCores, crossSection) => {
      parseSpan(`MARK (${span}) suffix`, span, {
        configuration,
        cores,
        groupCores,
        crossSection,
        groundCores: null,
        groundSection: null,
        attributes: [],
        warnings: [],
      });
    }
  );

  test.each([
    ['3x16+1x10+1x6', '3\u044516+1\u044510+1\u04456'],
    [
      '7x4x1.05+5x2x0.7+1x0.7',
      '7\u04454\u04451.05+5\u04452\u04450.7+1\u04450.7',
    ],
    ['3x(2x0.22)+1x(3x0.56)', '3\u0445(2\u04450.22)+1\u0445(3\u04450.56)'],
    ['2x2x0.5+0.5', '2\u04452\u04450.5+0.5'],
    ['3x95(C)+1x50', '3\u044595(C)+1\u044550'],
    ['2x2x0.35pse+6x1,5', '2\u04452\u04450.35pse+6\u04451,5'],
  ])(
    'preserves every term without assigning false ground fields: %s',
    (span, configuration) => {
      parseSpan(`MARK ${span} 6kV`, span, {
        configuration,
        cores: null,
        groupCores: null,
        crossSection: null,
        groundCores: null,
        groundSection: null,
        warnings: [],
      });
    }
  );

  test('preserves decimal first dimensions as rectangular geometry', () => {
    parseSpan('\u0410\u041f\u0411 1,8 \u0445 4,0/1,92', '1,8 \u0445 4,0/1,92', {
      configuration: '1,8\u04454,0/1,92',
      cores: null,
      groupCores: null,
      crossSection: null,
      groundCores: null,
      groundSection: null,
      warnings: [],
    });
  });

  test.each([
    ['3x(2x22 AWG STP)', 3, 2],
    ['4x2xAWG24', 4, 2],
    ['4x2xAWG 23/1', 4, 2],
    ['2x18AWG', 2, null],
    ['3x(2x22)AWG', 3, 2],
    ['2x8(2x10)AWG', null, null],
    ['1x2xAWG24+1x2xAWG22', null, null],
  ])(
    'never treats an AWG gauge as square millimetres: %s',
    (span, cores, groupCores) => {
      const result = parseSpan(`MARK ${span} vendor 9822C03101`, span, {
        cores,
        groupCores,
        crossSection: null,
        attributes: ['AWG'],
        warnings: [],
      });
      expect(result.configuration).toContain('AWG');
    }
  );

  test('bounds unknown annotations and leaves the commercial suffix untouched', () => {
    parseSpan(
      'MARK 4x(2x1mystery7 custom label) vendor 0.66kV',
      '4x(2x1mystery7 custom label)',
      {
        configuration: '4\u0445(2\u04451mystery7 custom label)',
        cores: 4,
        groupCores: 2,
        crossSection: 1,
        warnings: [],
      }
    );
    parseSpan(
      'MARK 4x(2x1mystery7 vendor words without close',
      '4x(2x1mystery7',
      {
        configuration: '4\u0445(2\u04451mystery7',
        warnings: ['unclosed_group'],
      }
    );
  });

  test('preserves the real unclosed group without falling back to its inner pair', () => {
    const source =
      '\u041d\u0418\u041a\u0418-\u041a\u0423\u041f\u0441\u041a\u0428\u042d\u0444-\u0412\u043d\u0433(\u0410)LS-\u0421 6\u0445(2\u04451\u043c\u043a\u043b2';
    parseSpan(source, '6\u0445(2\u04451\u043c\u043a\u043b2', {
      configuration: '6\u0445(2\u04451\u043c\u043a\u043b2',
      warnings: ['unclosed_group'],
      cores: null,
      groupCores: null,
      crossSection: null,
    });
  });

  test.each([
    [null],
    [undefined],
    [''],
    ['123456789'],
    ['123456-2x3'],
    ['ABC123x45'],
    ['6XV1830-5FH10'],
    ['RE-2x(ST)Y-FL'],
    ['RE2x(ST)Y-FL'],
    ['123.456.2x3'],
    ['123/2x3'],
  ])('does not find dimensions inside articles or marks: %s', (source) => {
    expect(findCableSpecification(source)).toBeNull();
  });

  test('skips a mark and article and finds the actual later specification', () => {
    parseSpan('RE-2x(ST)Y-FL 123456-2x3 16x2x1 suffix', '16x2x1', {
      cores: 16,
      groupCores: 2,
      crossSection: 1,
      warnings: [],
    });
  });

  test('does not mistake climate suffixes for another dimension', () => {
    parseSpan('MARK 4 \u0445 1.5 \u0445\u043b', '4 \u0445 1.5', {
      configuration: null,
      warnings: [],
    });
    parseSpan('MARK 10x2x0,7\u0445\u043b-315', '10x2x0,7', {
      crossSection: 0.7,
      warnings: [],
    });
  });

  test('leaves parenthesized voltage ranges outside the specification', () => {
    parseSpan('NEXANS A2XSEY 3x50/16(6-10)', '3x50/16', {
      configuration: '3\u044550/16',
      cores: 3,
      crossSection: 50,
      warnings: [],
    });
  });

  test('leaves a numeric article after AWG outside the span', () => {
    parseSpan('MARK 4x2x24 AWG 982203101', '4x2x24 AWG', {
      configuration: '4\u04452\u044524 AWG',
      crossSection: null,
      attributes: ['AWG'],
      warnings: [],
    });
  });

  test('preserves a bounded annotation containing a slash', () => {
    parseSpan('MARK 4x(2x1m/mkl1) suffix', '4x(2x1m/mkl1)', {
      configuration: '4\u0445(2\u04451m/mkl1)',
      crossSection: 1,
      warnings: [],
    });
  });

  test.each([
    '\u044d\u0444',
    '\u044d\u0430',
    '\u044d\u043c',
    '\u044d\u044d',
    '\u044d',
    '\u0437',
    '\u0437\u044d\u043b',
  ])(
    'extracts the exact inner screen annotation %s without changing source offsets',
    (screen) => {
      const span = `2\u0445(2\u04451${screen})`;
      const result = parseSpan(
        `\u041c\u041a\u042d\u0428\u0412 ${span}\u044d`,
        span,
        {
          configuration: '2\u0445(2\u04451)',
          cores: 2,
          groupCores: 2,
          crossSection: 1,
          attributes: [screen.toUpperCase()],
          warnings: [],
        }
      );
      expect(result.length).toBe(span.length);
    }
  );

  test('extracts spaced and uppercase screens and deduplicates them', () => {
    parseSpan(
      'MARK 2x(2x1 \u042d\u0424)+3x(2x1\u044d\u0444)',
      '2x(2x1 \u042d\u0424)+3x(2x1\u044d\u0444)',
      {
        configuration: '2\u0445(2\u04451)+3\u0445(2\u04451)',
        attributes: ['\u042d\u0424'],
        warnings: [],
      }
    );
  });

  test('preserves count annotations before an inner multiplier', () => {
    parseSpan('MARK 2x(2\u044dx1)', '2x(2\u044dx1)', {
      configuration: '2\u0445(2\u04451)',
      attributes: ['\u042d'],
      cores: 2,
      groupCores: 2,
      crossSection: 1,
      warnings: [],
    });
    parseSpan('MARK 2x(2mkl1x1)', '2x(2mkl1x1)', {
      configuration: '2\u0445(2mkl1\u04451)',
      attributes: [],
      warnings: [],
    });
  });

  test.each(['2\u044d\u04453\u04451', '2\u044dx3x1', '2\u044d x 3 x 1'])(
    'preserves an annotated initial count: %s',
    (span) => {
      parseSpan(`MARK ${span} suffix`, span, {
        configuration: '2\u044d\u04453\u04451',
        cores: 2,
        groupCores: 3,
        crossSection: 1,
        attributes: [],
        warnings: [],
      });
    }
  );

  test.each(['1+1\u04451.5', '1 + 1 x 1.5', '1+2+3x0.5'])(
    'preserves a leading count sum: %s',
    (span) => {
      const result = parseSpan(`\u041f\u0422\u0424 ${span} suffix`, span, {
        cores: null,
        groupCores: null,
        crossSection: null,
        groundCores: null,
        groundSection: null,
        warnings: [],
      });
      expect(result.configuration).toBe(
        span.replaceAll(' ', '').replaceAll('x', '\u0445')
      );
    }
  );

  test('does not match a sum without any multiplication', () => {
    expect(findCableSpecification('MARK 1+1 suffix')).toBeNull();
  });

  test('keeps annotations that only start with a recognized screen', () => {
    parseSpan('MARK 2x(2x1\u044d\u0444custom)', '2x(2x1\u044d\u0444custom)', {
      configuration: '2\u0445(2\u04451\u044d\u0444custom)',
      attributes: [],
      warnings: [],
    });
  });

  test('retains the outer malformed span when extracting an inner screen', () => {
    parseSpan('MARK 6x(2x1\u044d\u0444 suffix 2x1', '6x(2x1\u044d\u0444', {
      configuration: '6\u0445(2\u04451',
      attributes: ['\u042d\u0424'],
      cores: null,
      crossSection: null,
      warnings: ['unclosed_group'],
    });
  });

  test('preserves annotations around nested groups and before additional groups', () => {
    parseSpan(
      'MARK 2x(3x(2x1)screen)+1x0.5 vendor',
      '2x(3x(2x1)screen)+1x0.5',
      {
        configuration: '2\u0445(3\u0445(2\u04451)screen)+1\u04450.5',
        cores: null,
        crossSection: null,
        warnings: [],
      }
    );
  });

  test.each([
    ['3x2.5+', 'missing_operand'],
    ['3x(2x)', 'missing_operand'],
    ['3x2..5', 'invalid_number'],
    ['3x0', 'invalid_dimension'],
    ['3x2.5/', 'missing_operand'],
    ['3x', 'missing_operand'],
    ['3x2x', 'missing_operand'],
  ])(
    'returns diagnostics and the original malformed span: %s',
    (span, warning) => {
      const result = parseSpan(`MARK ${span} suffix`, span, {
        cores: null,
        groupCores: null,
        crossSection: null,
        groundCores: null,
        groundSection: null,
      });
      expect(result.warnings).toContain(warning);
      expect(result.configuration).not.toBeNull();
    }
  );

  test('supports long additive chains without dropping a term', () => {
    const span = Array.from({ length: 80 }, (_, i) => `${i + 1}x0.5`).join('+');
    const result = parseSpan(span, span, {
      cores: null,
      crossSection: null,
      warnings: [],
    });
    expect(result.configuration.split('+')).toHaveLength(80);
  });

  test('bounds nesting and oversized input with a diagnostic', () => {
    const nested = `2x${'('.repeat(20)}2x1${')'.repeat(20)}`;
    expect(findCableSpecification(nested).warnings).toContain('nesting_limit');
    const oversized = `2x${'1'.repeat(5000)}`;
    const result = findCableSpecification(oversized);
    expect(result.length).toBeLessThanOrEqual(4096);
    expect(result.warnings).toContain('specification_too_long');
  });
});
