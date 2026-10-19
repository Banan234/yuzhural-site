import { Link } from 'react-router-dom';
import '../../styles/components/breadcrumbs.css';

export default function Breadcrumbs({ items, current }) {
  const crumbs = items || [{ label: 'Главная', to: '/' }, { label: current }];
  if (crumbs.length < 2) return null;

  return (
    <nav className="breadcrumbs" aria-label="Хлебные крошки">
      <ol>
        {crumbs.map((item, index) => (
          <li key={`${item.label}-${index}`}>
            {index > 0 && (
              <span className="breadcrumbs__separator" aria-hidden="true">
                ·
              </span>
            )}
            {index < crumbs.length - 1 && item.to ? (
              <Link to={item.to}>{item.label}</Link>
            ) : (
              <span
                className="breadcrumbs__label"
                aria-current={index === crumbs.length - 1 ? 'page' : undefined}
              >
                {item.label}
              </span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}
