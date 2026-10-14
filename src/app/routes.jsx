// Файл собирает общие route objects, layout, SEO-хуки и scroll-поведение для всех страниц.

import MainLayout from '../components/layout/MainLayout';

export function createRouteObjects({
  SpecificationPage,
  OrderGuidePage,
  QualityPage,
  CableApplicationPage,
  CableSectionPage,
  HomePage,
  CatalogPage,
  ProductPage,
  CableWeightPage,
  ServicesPage,
  CableKnowledgePage,
  CableDrumPage,
  CableShippingPage,
  CartPage,
  ContactsPage,
  DeliveryPage,
  PaymentPage,
  PrivacyPage,
  AboutPage,
  InternalRuntimePage,
  NotFoundPage,
}) {
  const children = [
    { index: true, element: <HomePage /> },
    { path: 'catalog/:slug?', element: <CatalogPage /> },
    { path: 'product/:slug', element: <ProductPage /> },
    { path: 'cart', element: <CartPage /> },
    { path: 'contacts', element: <ContactsPage /> },
    { path: 'delivery', element: <DeliveryPage /> },
    { path: 'payment', element: <PaymentPage /> },
    { path: 'privacy', element: <PrivacyPage /> },
    { path: 'about', element: <AboutPage /> },
  ];

  for (const [path, Page] of [
    ['specification', SpecificationPage],
    ['how-to-order', OrderGuidePage],
    ['quality', QualityPage],
    ['services/application', CableApplicationPage],
    ['calculator/section', CableSectionPage],
  ]) {
    if (Page) children.push({ path, element: <Page /> });
  }
  if (CableWeightPage) {
    children.push({ path: 'calculator/weight', element: <CableWeightPage /> });
  }

  if (ServicesPage)
    children.push({ path: 'services', element: <ServicesPage /> });
  if (CableKnowledgePage) {
    for (const mode of ['marking', 'reference', 'analogs', 'manufacturers']) {
      children.push({
        path: `services/${mode}`,
        element: <CableKnowledgePage key={mode} mode={mode} />,
      });
    }
  }
  if (CableDrumPage)
    children.push({ path: 'services/drum', element: <CableDrumPage /> });
  if (CableShippingPage)
    children.push({
      path: 'services/shipping',
      element: <CableShippingPage />,
    });

  if (InternalRuntimePage) {
    children.push({
      path: 'internal/runtime',
      element: <InternalRuntimePage />,
    });
  }

  children.push({ path: '*', element: <NotFoundPage /> });

  return [
    {
      path: '/',
      element: <MainLayout />,
      children,
    },
  ];
}
