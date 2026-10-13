import { Link } from 'react-router-dom';
import { serviceUrl } from '../../lib/cableServices';
import '../../styles/pages/services.css';

export default function ProductServiceLinks({ product, quantity = 1 }) {
  const designation =
    product.sourceName ||
    product.fullName ||
    product.title ||
    product.name ||
    product.mark;
  return (
    <nav
      className="service-product-links"
      aria-label="Сервисы для этого кабеля"
    >
      <Link
        to={serviceUrl('weight', {
          designation,
          length: product.unit === 'м' ? quantity : undefined,
        })}
      >
        Вес и диаметр
      </Link>
      <Link to={serviceUrl('marking', { designation })}>
        Расшифровка маркировки
      </Link>
      <Link to={serviceUrl('analogs', { designation })}>Проверить замену</Link>
      <Link to={serviceUrl('manufacturers', { mark: product.mark })}>
        Документация изготовителей
      </Link>
    </nav>
  );
}
