// Файл рендерит страницу 404 с навигацией обратно к каталогу и главной.

import { Link } from 'react-router-dom';
import Container from '../components/ui/Container';
import Breadcrumbs from '../components/ui/Breadcrumbs';
import { useSEO } from '../hooks/useSEO';
import { CATALOG_CANONICAL_PATH } from '../lib/canonicalPaths.js';
import { messages } from '../../shared/messages.js';
import '../styles/pages/content.css';

export const NOT_FOUND_SEO = Object.freeze({
  title: 'Страница не найдена',
  description:
    'Страница не найдена. Перейдите в каталог ЮжУралЭлектроКабель или вернитесь на главную.',
  canonical: false,
  noindex: true,
});

export function NotFoundPageContent() {
  return (
    <section className="section">
      <Container>
        <Breadcrumbs current="Страница не найдена" />
        <div className="content-page">
          <h1 className="page-title">Страница не найдена</h1>
          <p className="page-subtitle">
            Адрес устарел или был набран с ошибкой.
          </p>
          <div className="content-actions">
            <Link to={CATALOG_CANONICAL_PATH} className="button-primary">
              {messages.text.backToCatalog}
            </Link>
            <Link to="/" className="button-secondary">
              На главную
            </Link>
          </div>
        </div>
      </Container>
    </section>
  );
}

export default function NotFoundPage() {
  useSEO(NOT_FOUND_SEO);
  return <NotFoundPageContent />;
}
