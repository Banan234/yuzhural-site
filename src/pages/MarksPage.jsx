import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import Container from '../components/ui/Container';
import Breadcrumbs from '../components/ui/Breadcrumbs';
import { useSEO } from '../hooks/useSEO';
import { usePrerenderData } from '../lib/prerenderData';
import { catalogMarkUrl } from '../lib/cableServices';
import { russianCountNoun } from '../lib/russianCount';
import '../styles/pages/marks.css';

export default function MarksPage() {
  const prerenderData = usePrerenderData();
  const [groups, setGroups] = useState(() =>
    Array.isArray(prerenderData.marks) ? prerenderData.marks : []
  );
  const [loading, setLoading] = useState(!Array.isArray(prerenderData.marks));
  const [error, setError] = useState(false);

  useSEO({
    title: 'Алфавитный перечень марок кабеля',
    description:
      'Все марки кабеля и провода из текущего каталога ЮжУралЭлектроКабель. Найдите нужную марку в алфавитном перечне.',
    canonical: '/marks/',
  });

  useEffect(() => {
    const controller = new AbortController();
    async function loadMarks() {
      try {
        const response = await fetch('/api/marks', {
          signal: controller.signal,
        });
        if (!response.ok) throw new Error('Не удалось загрузить марки');
        const data = await response.json();
        if (!data.ok || !Array.isArray(data.groups))
          throw new Error('Неверный ответ');
        setGroups(data.groups);
        setError(false);
      } catch (requestError) {
        if (requestError.name !== 'AbortError') setError(true);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    loadMarks();
    return () => controller.abort();
  }, []);

  const total = groups.reduce((sum, group) => sum + group.marks.length, 0);

  return (
    <main className="marks-page">
      <Container>
        <Breadcrumbs
          items={[
            { label: 'Главная', to: '/' },
            { label: 'Каталог', to: '/catalog/' },
            { label: 'Алфавитный перечень' },
          ]}
        />
        <header className="marks-page__heading">
          <div className="marks-page__heading-line">
            <h1>Алфавитный перечень</h1>
            {total > 0 && (
              <span>
                {total.toLocaleString('ru-RU')}{' '}
                {russianCountNoun(total, {
                  one: 'марка',
                  few: 'марки',
                  many: 'марок',
                })}
              </span>
            )}
          </div>
        </header>

        {loading && groups.length === 0 && (
          <p role="status">Загружаем марки…</p>
        )}
        {error && (
          <p role="alert">
            Не удалось обновить перечень.{' '}
            {groups.length === 0
              ? 'Попробуйте открыть страницу позже.'
              : 'Показаны марки из последней сборки сайта.'}
          </p>
        )}

        <div className="marks-page__groups">
          {groups.map((group) => (
            <section className="marks-page__group" id={group.id} key={group.id}>
              <h2>{group.letter}</h2>
              <ul
                style={{
                  '--marks-rows-6': Math.ceil(group.marks.length / 6),
                  '--marks-rows-4': Math.ceil(group.marks.length / 4),
                  '--marks-rows-3': Math.ceil(group.marks.length / 3),
                  '--marks-rows-2': Math.ceil(group.marks.length / 2),
                  '--marks-rows-1': group.marks.length,
                }}
              >
                {group.marks.map(({ mark, count }) => (
                  <li key={mark}>
                    <Link
                      to={catalogMarkUrl(mark)}
                      title={`В каталоге: ${count} ${russianCountNoun(count, {
                        one: 'позиция',
                        few: 'позиции',
                        many: 'позиций',
                      })}`}
                    >
                      {mark}
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </Container>
    </main>
  );
}
