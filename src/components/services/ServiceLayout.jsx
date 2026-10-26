import { useEffect, useRef } from 'react';
import { NavLink } from 'react-router-dom';
import Container from '../ui/Container';
import Breadcrumbs from '../ui/Breadcrumbs';
import { useSEO } from '../../hooks/useSEO';
import {
  CABLE_SERVICES,
  SERVICES_PATH,
  getCableService,
} from '../../lib/cableServices';
import '../../styles/pages/services.css';

export default function ServiceLayout({ serviceKey, children }) {
  const service = getCableService(serviceKey);
  const navRef = useRef(null);
  useEffect(() => {
    const nav = navRef.current;
    const active = nav?.querySelector('[aria-current="page"]');
    if (nav && active) {
      nav.scrollLeft = active.offsetLeft - nav.offsetLeft;
    }
  }, [serviceKey]);
  useSEO({
    title: service?.title || 'Сервисы для выбора и самовывоза кабеля',
    description:
      service?.description ||
      'Расчёт веса и диаметра, расшифровка маркировки, справочник кабеля, сравнение возможных замен и подготовка самовывоза.',
    canonical: service?.path || SERVICES_PATH,
  });
  return (
    <section className="services-page">
      <Container>
        <Breadcrumbs
          items={[
            { label: 'Главная', to: '/' },
            ...(service
              ? [
                  { label: 'Сервисы', to: SERVICES_PATH },
                  { label: service.short },
                ]
              : [{ label: 'Сервисы' }]),
          ]}
        />
        <header className="services-heading">
          <h1>{service?.title || 'Сервисы для работы с кабелем'}</h1>
          <p>
            {service?.description ||
              'Подберите параметры, проверьте обозначение и подготовьте данные для заказа. Результат каждого инструмента можно передать менеджеру.'}
          </p>
        </header>
        {service && (
          <nav
            ref={navRef}
            className="services-nav"
            aria-label="Сервисы кабеля"
          >
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
