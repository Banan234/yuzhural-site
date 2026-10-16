import { Link, NavLink } from 'react-router-dom';
import Container from '../ui/Container';
import { useSEO } from '../../hooks/useSEO';
import {
  CABLE_SERVICES,
  SERVICES_PATH,
  getCableService,
} from '../../lib/cableServices';
import '../../styles/pages/services.css';

export default function ServiceLayout({ serviceKey, children }) {
  const service = getCableService(serviceKey);
  useSEO({
    title: service?.title || 'Сервисы для выбора и доставки кабеля',
    description:
      service?.description ||
      'Расчёт веса и диаметра, расшифровка маркировки, справочник кабеля, сравнение возможных замен и подготовка доставки.',
    canonical: service?.path || SERVICES_PATH,
  });
  return (
    <section className="services-page">
      <Container>
        <nav className="services-breadcrumbs" aria-label="Хлебные крошки">
          <Link to="/">Главная</Link>
          <span aria-hidden="true">/</span>
          {service ? (
            <>
              <Link to={SERVICES_PATH}>Сервисы</Link>
              <span aria-hidden="true">/</span>
              <span>{service.short}</span>
            </>
          ) : (
            <span>Сервисы</span>
          )}
        </nav>
        <header className="services-heading">
          <h1>{service?.title || 'Сервисы для работы с кабелем'}</h1>
          <p>
            {service?.description ||
              'Подберите параметры, проверьте обозначение и подготовьте данные для заказа. Результат каждого инструмента можно передать менеджеру.'}
          </p>
        </header>
        {service && (
          <nav className="services-nav" aria-label="Сервисы кабеля">
            {CABLE_SERVICES.map((item) => (
              <NavLink key={item.key} to={item.path}>
                {item.short}
              </NavLink>
            ))}
          </nav>
        )}
        {children}
      </Container>
    </section>
  );
}
