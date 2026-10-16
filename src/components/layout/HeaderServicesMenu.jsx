import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { CABLE_SERVICES, SERVICES_PATH } from '../../lib/cableServices';

const SERVICES_DROPDOWN_ID = 'services-dropdown';

export default function HeaderServicesMenu() {
  const location = useLocation();
  const [isOpen, setIsOpen] = useState(false);
  const isServicesPage =
    location.pathname.startsWith(SERVICES_PATH) ||
    location.pathname.startsWith('/calculator/');

  useEffect(() => {
    setIsOpen(false);
  }, [location.pathname, location.search]);

  return (
    <div
      className="header-services"
      onMouseEnter={() => setIsOpen(true)}
      onMouseLeave={() => setIsOpen(false)}
      onFocus={() => setIsOpen(true)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) {
          setIsOpen(false);
        }
      }}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          setIsOpen(false);
        }
      }}
    >
      <Link
        to={SERVICES_PATH}
        className={`nav-link header-services__trigger${
          isServicesPage || isOpen ? ' nav-link--active' : ''
        }`}
        aria-expanded={isOpen}
        aria-controls={isOpen ? SERVICES_DROPDOWN_ID : undefined}
        onClick={() => setIsOpen(false)}
      >
        Сервисы
        <span className="header-services__chevron" aria-hidden="true" />
      </Link>

      {isOpen && (
        <div id={SERVICES_DROPDOWN_ID} className="header-services__dropdown">
          <div className="header-services__panel">
            <Link
              to={SERVICES_PATH}
              className="header-services__all"
              onClick={() => setIsOpen(false)}
            >
              Все сервисы
            </Link>
            {CABLE_SERVICES.map((service) => (
              <Link
                key={service.key}
                to={service.path}
                className="header-services__item"
                onClick={() => setIsOpen(false)}
              >
                {service.title}
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
