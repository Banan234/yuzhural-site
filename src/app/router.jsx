// Файл создаёт browser router приложения и lazy-load чанки страниц по маршрутам.

import { lazy } from 'react';
import { createBrowserRouter } from 'react-router-dom';
import { createRouteObjects } from './routes';
import HomePage from '../pages/HomePage';

// Все страницы — отдельные чанки. На первый paint грузится только тот,
// который соответствует текущему маршруту. Главная загружается синхронно,
// чтобы убрать route waterfall для первого визита на /.
const CatalogPage = lazy(() => import('../pages/CatalogPage'));
const ProductPage = lazy(() => import('../pages/ProductPage'));
const CartPage = lazy(() => import('../pages/CartPage'));
const ContactsPage = lazy(() => import('../pages/ContactsPage'));
const DeliveryPage = lazy(() => import('../pages/DeliveryPage'));
const PaymentPage = lazy(() => import('../pages/PaymentPage'));
const PrivacyPage = lazy(() => import('../pages/PrivacyPage'));
const AboutPage = lazy(() => import('../pages/AboutPage'));
const InternalRuntimePage = lazy(() => import('../pages/InternalRuntimePage'));
const NotFoundPage = lazy(() => import('../pages/NotFoundPage'));

export const router = createBrowserRouter(
  createRouteObjects({
    HomePage,
    CatalogPage,
    ProductPage,
    CartPage,
    ContactsPage,
    DeliveryPage,
    PaymentPage,
    PrivacyPage,
    AboutPage,
    InternalRuntimePage,
    NotFoundPage,
  }),
  {
    future: {
      v7_relativeSplatPath: true,
    },
  }
);
