import { Link } from 'react-router-dom';
import Container from '../ui/Container';
import { useJsonLd } from '../../hooks/useJsonLd';
import {
  buildStaticPageJsonLd,
  getStaticPageJsonLdId,
} from '../../lib/staticPageJsonLd';
import { useSEO } from '../../hooks/useSEO';
import { PURCHASE_PAGES } from '../../../shared/purchaseContent';
import '../../styles/pages/purchase.css';
export default function PurchaseLayout({ pageKey, children }) {
  const page = PURCHASE_PAGES[pageKey];
  useJsonLd(getStaticPageJsonLdId(page.path), buildStaticPageJsonLd(page.path));
  useSEO({
    title: page.title,
    description: page.description,
    canonical: page.path,
  });
  return (
    <section className="purchase-page">
      <Container>
        <nav className="purchase-breadcrumbs" aria-label="Хлебные крошки">
          <Link to="/">Главная</Link>
          <span>/</span>
          <span>{page.title}</span>
        </nav>
        <header className="purchase-heading">
          <span className="services-eyebrow">ЮЖУРАЛЭЛЕКТРОКАБЕЛЬ</span>
          <h1>{page.title}</h1>
          <p>{page.description}</p>
        </header>
        {children}
      </Container>
    </section>
  );
}
