import { Link } from 'react-router-dom';
import ServiceLayout from '../components/services/ServiceLayout';
import { CABLE_SERVICES } from '../lib/cableServices';

export default function ServicesPage() {
  return (
    <ServiceLayout>
      <div className="services-grid">
        {CABLE_SERVICES.map((service) => (
          <Link className="service-card" to={service.path} key={service.key}>
            <span className="service-card__number">{service.number}</span>
            <h2>{service.title}</h2>
            <p>{service.description}</p>
            <span className="service-card__go">
              Открыть сервис <span aria-hidden="true">↗</span>
            </span>
          </Link>
        ))}
      </div>
      <aside className="service-note">
        <strong>Результат можно использовать в заявке.</strong> В расчётных
        инструментах есть выгрузка в PDF и текст, в калькуляторе веса — также
        CSV. Кнопка обращения к менеджеру переносит выбранные параметры в форму
        заявки.
      </aside>
    </ServiceLayout>
  );
}
