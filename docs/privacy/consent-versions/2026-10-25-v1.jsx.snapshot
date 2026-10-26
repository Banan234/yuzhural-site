import Container from '../components/ui/Container';
import Breadcrumbs from '../components/ui/Breadcrumbs';
import { useSEO } from '../hooks/useSEO';
import {
  SITE_LEGAL_FULL_NAME,
  SITE_OFFICE_ADDRESS_DISPLAY,
  SITE_EMAIL,
  SITE_EMAIL_HREF,
} from '../lib/siteConfig';
import {
  PERSONAL_DATA_CONSENT_VERSION,
  PERSONAL_DATA_CONSENT_PATH,
} from '../../shared/personalDataConsent';
import '../styles/pages/content.css';

export default function PersonalDataConsentPage() {
  useSEO({
    title: 'Согласие на обработку персональных данных',
    description:
      'Согласие на обработку данных для ответа на обращение и подготовки коммерческого предложения.',
    canonical: PERSONAL_DATA_CONSENT_PATH,
  });
  return (
    <section className="section">
      <Container>
        <Breadcrumbs current="Согласие на обработку персональных данных" />
        <article className="privacy-doc">
          <h1 className="page-title">
            Согласие на обработку персональных данных
          </h1>
          <p>Редакция: {PERSONAL_DATA_CONSENT_VERSION}</p>
          <p>
            Отмечая отдельное поле согласия и отправляя форму, я свободно, своей
            волей и в своём интересе даю {SITE_LEGAL_FULL_NAME} (адрес:{' '}
            {SITE_OFFICE_ADDRESS_DISPLAY}) согласие на обработку предоставленных
            мной персональных данных.
          </p>
          <h2>Цель и состав данных</h2>
          <p>
            Ответ на обращение, связь со мной, подбор продукции и подготовка
            коммерческого предложения. Обрабатываются указанные мной имя, ФИО,
            телефон, электронная почта, предпочтительный способ связи,
            содержание обращения и сведения в приложенных файлах. Не следует
            прикладывать документы с избыточными персональными данными.
          </p>
          <h2>Действия с данными</h2>
          <p>
            Сбор, запись, систематизация, накопление, хранение, уточнение,
            извлечение, использование, предоставление доступа уполномоченным
            работникам оператора, блокирование, удаление и уничтожение с
            использованием средств автоматизации и без них. Публикация моих
            данных и рекламные рассылки этим согласием не разрешаются.
          </p>
          <h2>Срок и отзыв согласия</h2>
          <p>
            Согласие действует до достижения указанных целей либо до его отзыва.
            Направить отзыв или обращение можно на{' '}
            <a href={SITE_EMAIL_HREF}>{SITE_EMAIL}</a>. После отзыва обработка
            может продолжаться только при наличии другого предусмотренного
            законом основания, в том числе для исполнения договора и
            обязательного хранения документов.
          </p>
          <p>
            Подробнее о порядке обработки и правах пользователя — в{' '}
            <a href="/privacy">политике обработки персональных данных</a>.
          </p>
        </article>
      </Container>
    </section>
  );
}
