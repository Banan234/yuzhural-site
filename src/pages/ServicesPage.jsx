import { Link } from 'react-router-dom';
import ServiceLayout from '../components/services/ServiceLayout';
import ServiceArtwork from '../components/services/ServiceArtwork';
import { CABLE_SERVICES } from '../lib/cableServices';

export default function ServicesPage() {
  return (
    <ServiceLayout>
      <div className="services-grid">
        {CABLE_SERVICES.map((service) => (
          <Link
            className={`service-card service-card--${service.key}`}
            to={service.path}
            key={service.key}
          >
            <ServiceArtwork type={service.key} />
            <h2>{service.title}</h2>
            <p>{service.description}</p>
            <span className="service-card__go">
              <span className="service-card__go-label">Открыть сервис</span>
              <span className="service-card__go-arrow" aria-hidden="true">
                ↗
              </span>
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
