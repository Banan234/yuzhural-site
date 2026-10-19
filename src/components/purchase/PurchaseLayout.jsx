import Container from '../ui/Container';
import Breadcrumbs from '../ui/Breadcrumbs';
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
        <Breadcrumbs current={page.title} />
        <header className="purchase-heading">
          <h1>{page.title}</h1>
          <p>{page.description}</p>
        </header>
        {children}
      </Container>
    </section>
  );
}
