// Файл показывает на главной витрину ключевых категорий каталога с переходами в разделы.

import { Link } from 'react-router-dom';
import Container from '../ui/Container';

const categoryCards = [
  {
    title: 'Силовой кабель',
    to: '/catalog/silovoy-kabel',
    examples: 'ВВГ · АВВГ · ВБбШв',
  },
  {
    title: 'Кабель управления и контроля',
    to: '/catalog/kontrolnyy-kabel',
    examples: 'КВВГ · АКВВГ · КВБбШв',
  },
  {
    title: 'Монтажный кабель',
    to: '/catalog/montazhnyy-kabel',
    examples: 'МКШ · МКЭШ · КУИН',
  },
  {
    title: 'Провода',
    to: '/catalog/provoda',
    examples: 'ПВС · ПуГВ',
  },
  {
    title: 'Кабели передачи данных',
    to: '/catalog/kabeli-peredachi-dannykh',
    examples: 'UTP · FTP · КВК',
  },
  {
    title: 'Импортный кабель',
    to: '/catalog/importnye-kabeli',
    examples: 'BELDEN · Prysmian · SIEMENS',
  },
];

export default function CategoryShowcase() {
  return (
    <section className="section home-category-showcase">
      <Container>
        <div className="home-category-showcase__head">
          <h2 className="section-title section-title--left">
            <span id="popular-categories-title">Категории каталога</span>
          </h2>
          <Link to="/catalog/" className="home-category-showcase__all">
            Весь каталог <span aria-hidden="true">→</span>
          </Link>
        </div>

        <ul className="home-category-showcase__grid">
          {categoryCards.map((item) => (
            <li key={item.title} className="home-category-showcase__item">
              <Link to={item.to} className="home-category-showcase__card">
                <div className="home-category-showcase__body">
                  <h3 className="home-category-showcase__title">
                    {item.title} <span aria-hidden="true">→</span>
                  </h3>
                  <p className="home-category-showcase__examples">
                    {item.examples}
                  </p>
                </div>
                <div
                  className="home-category-showcase__media"
                  aria-hidden="true"
                />
              </Link>
            </li>
          ))}
        </ul>
      </Container>
    </section>
  );
}
