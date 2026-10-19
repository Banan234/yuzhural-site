const pluralRules = new Intl.PluralRules('ru');

export function russianCountNoun(count, forms) {
  return forms[pluralRules.select(Number(count))] || forms.many;
}
