const MAX_LENGTH = 4096;
const MAX_DEPTH = 8;
const MULTIPLY = /^[xXgG\u0445\u0425\u00d7]$/u;
const NUMBER = /^\d+(?:[.,]\d+)?/;
const WORD = /^[\p{L}][\p{L}\p{N}_/-]{0,31}/u;
const SCREEN_ANNOTATIONS = new Set([
  '\u044d\u0444',
  '\u044d\u0430',
  '\u044d\u043c',
  '\u044d\u044d',
  '\u044d',
  '\u0437',
  '\u0437\u044d\u043b',
]);

/**
 * Find the first cable specification. index/length address the original string.
 * configuration uses Cyrillic x, retaining decimal punctuation and annotations;
 * it is null only for plain NxS and exactly two plain NxS terms (legacy ground).
 * Numeric fields describe only unambiguous structures. AWG is never mm2.
 * Exact screen annotations within groups move to attributes; other annotations
 * stay in configuration. attributes also includes the explicit AWG unit.
 * warnings contains
 * stable string codes: missing_operand, invalid_number, invalid_dimension,
 * unclosed_group, nesting_limit, specification_too_long. Malformed expressions
 * retain their consumed text without repair and have null numeric fields.
 * Parsing is limited to 4096 characters and eight nested groups per candidate.
 */
export function findCableSpecification(source) {
  if (typeof source !== 'string') return null;

  const candidates = /\d+(?:[.,]\d+)?/gu;
  for (const match of source.matchAll(candidates)) {
    const index = match.index;
    // A dimension cannot start in a decimal, article, or alphanumeric mark.
    if (!hasSpecificationBoundary(source, index)) continue;
    const afterNumber = index + match[0].length;
    if (
      !/^\s*(?:[+xX\u0445\u0425\u00d7]|[gG](?=\s*\d)|[\p{L}][\p{L}\p{N}_/-]{0,31}\s*[xX\u0445\u0425\u00d7]\s*(?=\d|\())/u.test(
        source.slice(afterNumber, afterNumber + MAX_LENGTH)
      )
    )
      continue;

    const parser = new SpecificationReader(
      source.slice(index, index + MAX_LENGTH)
    );
    const expression = parser.sum(0);
    if (!expression || !parser.hasDimension) continue;

    const length = parser.position;
    if (length === MAX_LENGTH && index + length < source.length) {
      parser.warn('specification_too_long');
    }
    let raw = source.slice(index, index + length);
    const recoveredClosingGroup = canRecoverMissingClosingGroup(
      source,
      index,
      raw,
      parser
    );
    if (recoveredClosingGroup) {
      raw += ')';
      parser.warnings = parser.warnings.filter(
        (warning) => warning !== 'unclosed_group'
      );
    }
    const edits = [
      ...parser.screenSpans.map(([start, end]) => ({ start, end, text: '' })),
      ...parser.multipliers.map((start) => ({
        start,
        end: start + 1,
        text: '\u0445',
      })),
    ];
    for (const { start, end, text } of edits.sort(
      (a, b) => b.start - a.start
    )) {
      raw = raw.slice(0, start) + text + raw.slice(end);
    }
    const warnings = parser.warnings;
    const fields = numericFields(expression);
    if (parser.hasG && (expression.terms.length > 1 || raw.includes('/'))) {
      Object.keys(fields).forEach((key) => (fields[key] = null));
    }
    if (parser.hasAwg) fields.crossSection = null;
    if (warnings.length)
      Object.keys(fields).forEach((key) => (fields[key] = null));

    const legacy = !warnings.length && !parser.hasG && isLegacy(expression);
    return {
      index,
      length,
      configuration: legacy ? null : normalizeConfiguration(raw),
      ...fields,
      attributes: [
        ...new Set([...parser.attributes, ...(parser.hasAwg ? ['AWG'] : [])]),
      ],
      warnings,
      ...(recoveredClosingGroup ? { recoveredClosingGroup: true } : {}),
    };
  }
  return null;
}

function hasSpecificationBoundary(source, index) {
  if (index === 0 || /[\s()]/u.test(source[index - 1])) return true;
  if (source[index - 1] !== '-') return false;

  // A cable size may follow a mark through a hyphen, but only when a
  // recognised fire index immediately follows the size. This avoids treating
  // article fragments such as "123456-2x3" as a conductor configuration.
  return /^\d+(?:[.,]\d+)?\s*[xX\u0445\u0425\u00d7]\s*(?:\d+(?:[.,]\d+)?|\(\s*\d)[\s\S]{0,96}-нг(?:\s*\([АБВГДСA-D]\))?/iu.test(
    source.slice(index)
  );
}

function canRecoverMissingClosingGroup(source, index, raw, parser) {
  if (!parser.warnings.includes('unclosed_group')) return false;
  if (source.slice(index + raw.length).trim()) return false;
  if ((raw.match(/\(/gu) || []).length !== (raw.match(/\)/gu) || []).length + 1)
    return false;

  // In this supplier's control-cable notation mklN is a bounded pairing
  // annotation. A lone final group close is safe to restore after it.
  return /мкл\d+\s*$/iu.test(raw);
}

class SpecificationReader {
  constructor(source) {
    this.source = source;
    this.position = 0;
    this.warnings = [];
    this.hasDimension = false;
    this.hasAwg = false;
    this.hasG = false;
    this.attributes = [];
    this.screenSpans = [];
    this.multipliers = [];
  }

  warn(code) {
    if (!this.warnings.includes(code)) this.warnings.push(code);
  }

  skipSpace(position = this.position) {
    while (
      /\s/u.test(this.source[position] || '') &&
      position < this.source.length
    ) {
      position += 1;
    }
    return position;
  }

  sum(depth) {
    const first = this.product(depth);
    if (!first) return null;
    const terms = [first];
    while (this.source[this.skipSpace()] === '+') {
      this.position = this.skipSpace() + 1;
      const next = this.product(depth);
      if (!next) {
        this.warn('missing_operand');
        break;
      }
      terms.push(next);
    }
    return { kind: 'sum', terms };
  }

  product(depth) {
    const first = this.atom(depth);
    if (!first) return null;
    const factors = [first];
    let implicit = false;
    while (true) {
      const operator = this.skipSpace();
      const character = this.source[operator] || '';
      const adjacentGroup =
        operator === this.position &&
        character === '(' &&
        /^\s*\d+(?:[.,]\d+)?\s*[xX\u0445\u0425\u00d7]/u.test(
          this.source.slice(operator + 1)
        );
      if (!MULTIPLY.test(character) && !adjacentGroup) break;
      const nextStart = this.skipSpace(operator + (adjacentGroup ? 0 : 1));
      // The x in suffixes such as Cyrillic "khl" is not multiplication.
      if (
        !adjacentGroup &&
        nextStart === operator + 1 &&
        /^[\p{L}]/u.test(this.source.slice(nextStart)) &&
        !/^AWG\b|^AWG(?=\d)/iu.test(this.source.slice(nextStart))
      )
        break;

      this.position = nextStart;
      const next = this.atom(depth);
      if (!next) {
        // RE-2x(ST)Y is a mark, not a malformed numeric group.
        if (
          factors.length === 1 &&
          character &&
          this.source[nextStart] === '(' &&
          /^\s*\p{L}/u.test(this.source.slice(nextStart + 1))
        )
          return null;
        this.hasDimension = true;
        if (!adjacentGroup) this.multipliers.push(operator);
        this.position = operator + 1;
        this.warn('missing_operand');
        break;
      }
      this.hasDimension = true;
      if (/^[gG]$/u.test(character)) this.hasG = true;
      else if (!adjacentGroup) this.multipliers.push(operator);
      implicit ||= adjacentGroup;
      factors.push(next);
    }
    return { kind: 'product', factors, implicit };
  }

  atom(depth) {
    const start = this.skipSpace();
    if (this.source[start] === '(') return this.group(start, depth);

    let position = start;
    const prefix = this.source.slice(position).match(/^AWG\s*/iu);
    if (prefix) position += prefix[0].length;
    const match = this.source.slice(position).match(NUMBER);
    if (!match) return null;
    position += match[0].length;
    const node = {
      kind: 'number',
      value: Number(match[0].replace(',', '.')),
      decimal: /[.,]/u.test(match[0]),
      awg: Boolean(prefix),
      decorated: false,
    };
    if (
      !Number.isFinite(node.value) ||
      node.value <= 0 ||
      (!node.decimal && !Number.isSafeInteger(node.value))
    )
      this.warn('invalid_dimension');

    // Consume malformed decimal tails so a valid-looking prefix is not returned.
    const malformed = this.source.slice(position).match(/^[.,]+\d[\d.,]*/u);
    if (malformed) {
      position += malformed[0].length;
      this.warn('invalid_number');
    }
    this.position = position;
    const suffix = this.source
      .slice(this.skipSpace())
      .match(/^AWG(?:\d+)?(?![\p{L}\p{N}])/iu);
    if (suffix) {
      node.awg = true;
      this.position = this.skipSpace() + suffix[0].length;
    }
    if (this.source[this.skipSpace()] === '/') {
      this.position = this.skipSpace() + 1;
      const screen = this.source.slice(this.skipSpace()).match(NUMBER);
      if (screen) {
        this.position = this.skipSpace() + screen[0].length;
        const value = Number(screen[0].replace(',', '.'));
        if (!Number.isFinite(value) || value <= 0)
          this.warn('invalid_dimension');
      } else {
        this.warn('missing_operand');
      }
      node.decorated = true;
    }
    this.hasAwg ||= node.awg;
    node.decorated = this.annotation(depth) || node.decorated;
    return node;
  }

  group(start, depth) {
    if (/^\s*\p{L}/u.test(this.source.slice(start + 1))) return null;
    this.position = start + 1;
    if (depth >= MAX_DEPTH) {
      this.warn('nesting_limit');
      return { kind: 'group', expression: null, decorated: false };
    }
    const expression = this.sum(depth + 1);
    if (!expression) this.warn('missing_operand');
    const closing = this.skipSpace();
    if (this.source[closing] === ')') this.position = closing + 1;
    else this.warn('unclosed_group');

    const node = { kind: 'group', expression, decorated: false };
    const awg = this.source.slice(this.skipSpace()).match(/^AWG(?!\p{L})/iu);
    if (awg) {
      this.position = this.skipSpace() + awg[0].length;
      node.awg = true;
      this.hasAwg = true;
    }
    node.decorated = this.annotation(depth);
    return node;
  }

  annotation(depth) {
    const start = this.position;
    // A bounded parenthesized label can occur between terms, e.g. 3x95(C)+1x50.
    const label = this.source
      .slice(start)
      .match(/^\([\p{L}][\p{L}\p{N}_ -]{0,31}\)(?=\s*\+)/u);
    if (label) {
      this.position += label[0].length;
      return true;
    }
    const word = this.source.slice(start).match(WORD);
    if (word) {
      // A count annotation may precede another multiplier: 2e x 1.
      const multiplier = [...word[0]].findIndex(
        (character, index) =>
          MULTIPLY.test(character) &&
          /^(?:\d|AWG)/iu.test(word[0].slice(index + 1))
      );
      if (multiplier > 0) word[0] = word[0].slice(0, multiplier);
    }
    if (
      word &&
      !(
        MULTIPLY.test(word[0][0]) &&
        (word[0].length === 1 || /^(?:\d|AWG)/iu.test(word[0].slice(1)))
      )
    ) {
      const end = start + word[0].length;
      const next = this.skipSpace(end);
      const annotatedCount =
        MULTIPLY.test(this.source[next] || '') &&
        /^(?:\d|\(|AWG)/iu.test(this.source.slice(this.skipSpace(next + 1)));
      // Outside groups, annotations must join another factor or term.
      if (depth > 0 || annotatedCount || this.source[next] === '+') {
        this.position = end;
        if (depth > 0) this.screenAnnotation(word[0], start);
      }
    }
    if (depth > 0) {
      // Spaced labels must end at a close, rather than swallowing an unclosed tail.
      const labels = this.source
        .slice(this.position)
        .match(/^(?:\s+[\p{L}][\p{L}\p{N}_-]{0,31}){1,4}(?=\s*\))/u);
      if (labels) {
        for (const token of labels[0].matchAll(/[\p{L}][\p{L}\p{N}_-]*/gu)) {
          this.screenAnnotation(token[0], this.position + token.index);
        }
        this.position += labels[0].length;
      }
    }
    return this.position !== start;
  }

  screenAnnotation(token, start) {
    if (!SCREEN_ANNOTATIONS.has(token.toLowerCase())) return;
    this.attributes.push(token.toUpperCase());
    this.screenSpans.push([start, start + token.length]);
  }
}

function normalizeConfiguration(value) {
  return value
    .replace(/\s+/gu, ' ')
    .replace(/\s*([()+/])\s*/gu, '$1')
    .replace(/\s*\u0445\s*(?=\d|\(|AWG)/giu, '\u0445');
}

function isCount(node) {
  return (
    node?.kind === 'number' &&
    !node.decimal &&
    !node.awg &&
    Number.isSafeInteger(node.value) &&
    node.value > 0
  );
}

function plainPair(product) {
  return (
    product?.kind === 'product' &&
    !product.implicit &&
    product.factors.length === 2 &&
    isCount(product.factors[0]) &&
    product.factors.every(
      (node) => node.kind === 'number' && !node.awg && !node.decorated
    )
  );
}

function isLegacy(expression) {
  return expression.terms.length <= 2 && expression.terms.every(plainPair);
}

function emptyFields() {
  return {
    cores: null,
    groupCores: null,
    crossSection: null,
    groundCores: null,
    groundSection: null,
  };
}

function numericFields(expression) {
  const fields = emptyFields();
  if (expression.terms.length === 2 && expression.terms.every(plainPair)) {
    const [main, ground] = expression.terms;
    fields.cores = main.factors[0].value;
    fields.crossSection = main.factors[1].value;
    fields.groundCores = ground.factors[0].value;
    fields.groundSection = ground.factors[1].value;
    return fields;
  }
  if (expression.terms.length !== 1) return fields;

  const product = expression.terms[0];
  const [first, second, third] = product.factors;
  if (!isCount(first) || product.implicit) return fields;
  if (product.factors.length === 2 && second.kind === 'number') {
    fields.cores = first.value;
    fields.crossSection = second.awg ? null : second.value;
  } else if (
    product.factors.length === 3 &&
    third.kind === 'number' &&
    (isCount(second) || second.kind === 'group')
  ) {
    fields.cores = first.value;
    fields.groupCores = isCount(second) ? second.value : null;
    fields.crossSection = third.awg ? null : third.value;
  } else if (product.factors.length === 2 && second.kind === 'group') {
    const inner = second.expression;
    const innerFactors =
      inner?.terms.length === 1 ? inner.terms[0].factors : [];
    if (
      innerFactors.length === 2 &&
      isCount(innerFactors[0]) &&
      innerFactors[1].kind === 'number'
    ) {
      fields.cores = first.value;
      fields.groupCores = innerFactors[0].value;
      fields.crossSection =
        second.awg || innerFactors[1].awg ? null : innerFactors[1].value;
    }
  }
  return fields;
}
