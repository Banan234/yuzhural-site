import { useState } from 'react';
export default function CatalogFacet({
  label,
  values,
  selected,
  onToggle,
  counts = {},
  format = (value) => String(value),
}) {
  const [expanded, setExpanded] = useState(false);
  const [search, setSearch] = useState('');
  const meaningful = values.filter(
    (value) =>
      !['не определено', 'не применимо'].includes(
        String(value).toLowerCase()
      ) || selected.includes(value)
  );
  if (!meaningful.length) return null;
  const popular = [...meaningful].sort(
    (a, b) =>
      (counts[b] || 0) - (counts[a] || 0) ||
      String(a).localeCompare(String(b), 'ru', { numeric: true })
  );
  const top = popular.slice(0, 8);
  const visible = expanded
    ? meaningful.filter((value) =>
        format(value)
          .toLowerCase()
          .replace(',', '.')
          .includes(search.toLowerCase().replace(',', '.'))
      )
    : [
        ...new Set([
          ...top,
          ...meaningful.filter((value) => selected.includes(value)),
        ]),
      ];
  return (
    <div className="catalog-filter-row">
      <span className="catalog-filter-row__label">{label}</span>
      {expanded && meaningful.length > 8 && (
        <input
          className="catalog-facet-search"
          aria-label={`Найти значение: ${label}`}
          placeholder="Найти значение"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      )}
      <div className="catalog-filter-row__tags">
        {visible.map((value) => (
          <button
            key={value}
            type="button"
            aria-pressed={selected.includes(value)}
            className={`catalog-filter-tag${selected.includes(value) ? ' catalog-filter-tag--active' : ''}`}
            onClick={() => onToggle(value)}
          >
            {format(value)}
          </button>
        ))}
      </div>
      {expanded && !visible.length && (
        <p className="catalog-facet-empty">Значение не найдено</p>
      )}
      {meaningful.length > 8 && (
        <button
          className="catalog-facet-more"
          type="button"
          aria-expanded={expanded}
          onClick={() => {
            setExpanded(!expanded);
            setSearch('');
          }}
        >
          {expanded ? 'Свернуть' : `Все значения (${meaningful.length})`}
        </button>
      )}
    </div>
  );
}
