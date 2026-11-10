import { readAdminResponse } from '../lib/adminApi';
import { useEffect, useRef, useState } from 'react';
import { useSEO } from '../hooks/useSEO';
import '../styles/admin.css';
const tabs = [
  ['overview', 'Обзор'],
  ['requests', 'Заявки'],
  ['products', 'Товары'],
  ['imports', 'Импорт прайса'],
];
const statuses = {
  new: 'Новая',
  working: 'В работе',
  done: 'Завершена',
  spam: 'Спам',
};
const date = (v) =>
  v
    ? new Date(v).toLocaleString('ru-RU', { timeZone: 'Asia/Yekaterinburg' })
    : '—';
const importStatus = (value) =>
  ({
    failed: 'Ошибка импорта',
    success: 'Успешно',
    completed: 'Завершён',
    blocked: 'Заблокирован',
    skipped: 'Без изменений',
    warning: 'Требует проверки',
  })[value] ||
  value ||
  'Завершён';
const money = (v) =>
  Number(v || 0).toLocaleString('ru-RU', {
    style: 'currency',
    currency: 'RUB',
  });
function Field({ label, ...props }) {
  return (
    <label className="admin-field">
      <span>{label}</span>
      {props.multiline ? (
        <textarea
          {...Object.fromEntries(
            Object.entries(props).filter(([k]) => k !== 'multiline')
          )}
        />
      ) : (
        <input {...props} />
      )}
    </label>
  );
}
export default function AdminPage() {
  useSEO({ title: 'Панель управления — ЮУЭК', noindex: true });
  const [session, setSession] = useState(null);
  const [checking, setChecking] = useState(true);
  const [password, setPassword] = useState('');
  const [tab, setTab] = useState('overview');
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState(null);
  const generation = useRef(0);
  async function api(endpoint, options = {}) {
    const response = await fetch('/api/admin/' + endpoint, {
      credentials: 'same-origin',
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(session ? { 'X-CSRF-Token': session.csrf } : {}),
        ...options.headers,
      },
    });
    if (response.status === 401) setSession(null);
    return readAdminResponse(response);
  }
  useEffect(() => {
    api('session')
      .then(setSession)
      .catch((e) => {
        if (e.status !== 401) setError(e.message);
      })
      .finally(() => setChecking(false));
  }, []);
  async function load() {
    const id = ++generation.current;
    setLoading(true);
    setError('');
    try {
      const result = await api(
        tab === 'products'
          ? `products?search=${encodeURIComponent(search)}&page=${page}`
          : tab
      );
      if (generation.current !== id) return;
      setData(result);
    } catch (e) {
      if (generation.current === id) setError(e.message);
    } finally {
      if (generation.current === id) setLoading(false);
    }
  }
  useEffect(() => {
    if (session) load();
    return () => {
      generation.current++;
    };
  }, [session, tab, search, page]);
  async function perform(action) {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await action();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  function changeTab(next) {
    if (
      selected &&
      !window.confirm(
        'Перейти в другой раздел? Несохранённые изменения будут потеряны.'
      )
    )
      return;
    setTab(next);
    setData(null);
    setSelected(null);
    setNotice('');
    setSearch('');
    setPage(1);
  }
  const updateSelected = (key, value) =>
    setSelected((s) => ({ ...s, [key]: value }));
  async function saveProduct(e) {
    e.preventDefault();
    await perform(async () => {
      await api(selected.isNew ? 'products' : `products/${selected.id}`, {
        method: selected.isNew ? 'POST' : 'PUT',
        body: JSON.stringify({ ...selected, revision: data.revision }),
      });
      setSelected(null);
      await load();
      setNotice('Товар сохранён. Изменения доступны в каталоге.');
    });
  }
  if (checking)
    return (
      <main className="admin-login">
        <p role="status">Проверяем доступ…</p>
      </main>
    );
  if (!session)
    return (
      <main className="admin-login">
        <form
          className="admin-login-form"
          onSubmit={(e) => {
            e.preventDefault();
            perform(async () => {
              const result = await api('login', {
                method: 'POST',
                body: JSON.stringify({ password }),
              });
              setPassword('');
              setSession(result);
            });
          }}
        >
          <a href="/" className="admin-brand admin-brand--login">
            <picture>
              <source srcSet="/logo.webp" type="image/webp" />
              <img
                src="/logo.png"
                alt="ЮжУралЭлектроКабель"
                width="600"
                height="160"
                decoding="async"
              />
            </picture>
          </a>
          <h1>Панель управления</h1>
          <p>Вход для владельца сайта</p>
          <Field
            label="Пароль"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
            autoFocus
          />
          {error && (
            <p role="alert" className="admin-error">
              {error}
            </p>
          )}
          <button className="admin-primary" disabled={busy}>
            {busy ? 'Входим…' : 'Войти'}
          </button>
        </form>
      </main>
    );
  return (
    <div className="admin-shell">
      <aside className="admin-sidebar">
        <a className="admin-brand" href="/">
          ЮУЭК<span>Управление сайтом</span>
        </a>
        <nav aria-label="Разделы управления">
          {tabs.map(([key, label], i) => (
            <button
              key={key}
              aria-current={tab === key ? 'page' : undefined}
              onClick={() => changeTab(key)}
            >
              <span aria-hidden="true">{['◫', '☷', '▦', '↻'][i]}</span>
              {label}
            </button>
          ))}
        </nav>
        <div className="admin-sidebar-bottom">
          <a href="/" target="_blank" rel="noreferrer">
            Открыть сайт ↗
          </a>
          <button
            disabled={busy}
            onClick={() =>
              perform(async () => {
                await api('logout', { method: 'POST' });
                setSession(null);
                setData(null);
                setSelected(null);
              })
            }
          >
            Выйти из аккаунта
          </button>
        </div>
      </aside>
      <main className="admin-main">
        <header className="admin-header">
          <div>
            <p className="admin-eyebrow">ЮжУралЭлектроКабель</p>
            <h1>{tabs.find(([key]) => key === tab)[1]}</h1>
          </div>
          <button
            disabled={busy || loading}
            onClick={() => {
              if (
                !selected ||
                window.confirm(
                  'Обновить данные и сбросить несохранённые изменения?'
                )
              ) {
                setSelected(null);
                load();
              }
            }}
          >
            Обновить
          </button>
        </header>
        {error && (
          <p className="admin-error" role="alert">
            {error}
          </p>
        )}
        {notice && (
          <p className="admin-notice" role="status">
            {notice}
          </p>
        )}
        {loading && <p role="status">Загружаем данные…</p>}
        {data && tab === 'overview' && (
          <>
            <div className="admin-stats">
              <div>
                <span>Новые заявки</span>
                <strong>{data.newRequests}</strong>
                <button onClick={() => changeTab('requests')}>
                  Открыть заявки →
                </button>
              </div>
              <div>
                <span>Товаров в базе</span>
                <strong>{data.products.toLocaleString('ru-RU')}</strong>
                <small>С ручными правками: {data.editedProducts}</small>
              </div>
              <div>
                <span>Всего заявок</span>
                <strong>{data.requests}</strong>
                <small>С момента подключения админки</small>
              </div>
            </div>
            <section className="admin-panel">
              <h2>Последний импорт прайса</h2>
              <p>
                {data.report
                  ? `${date(data.report.generatedAt)} · ${importStatus(data.report.status)}`
                  : 'Отчётов пока нет'}
              </p>
              {data.report?.message && (
                <>
                  <p>
                    {data.report.status === 'failed' || data.report.blocked
                      ? 'Новый прайс не опубликован. На сайте остаётся предыдущий каталог.'
                      : 'Результат последней обработки прайса.'}
                  </p>
                  <details>
                    <summary>Подробности отчёта</summary>
                    <p className="admin-technical">{data.report.message}</p>
                  </details>
                </>
              )}
              <button onClick={() => changeTab('imports')}>
                Посмотреть отчёты
              </button>
            </section>
            <section className="admin-panel">
              <h2>Рабочие разделы</h2>
              <div className="admin-shortcuts">
                {tabs.slice(1, 4).map(([key, label]) => (
                  <button key={key} onClick={() => changeTab(key)}>
                    {label} →
                  </button>
                ))}
              </div>
            </section>
          </>
        )}
        {data && tab === 'requests' && (
          <div className={selected ? 'admin-split' : ''}>
            <section className="admin-panel">
              <h2>
                Входящие обращения <small>{data.items.length}</small>
              </h2>
              {!data.items.length && (
                <p className="admin-empty">
                  Новых обращений пока нет. Здесь появятся заявки, полученные
                  после подключения панели.
                </p>
              )}
              <div className="admin-list">
                {data.items.map((r) => (
                  <button
                    className="admin-list-row"
                    key={r.requestId}
                    onClick={() =>
                      perform(async () =>
                        setSelected(await api(`requests/${r.requestId}`))
                      )
                    }
                  >
                    <span>
                      <strong>
                        {r.name || r.phone || r.email || r.requestId}
                      </strong>
                      <small>
                        {r.phone || r.email} · {date(r.createdAt)}
                      </small>
                    </span>
                    <span className={`admin-badge admin-badge--${r.status}`}>
                      {statuses[r.status]}
                    </span>
                  </button>
                ))}
              </div>
            </section>
            {selected && (
              <form
                className="admin-panel admin-editor"
                onSubmit={(e) => {
                  e.preventDefault();
                  perform(async () => {
                    const result = await api(`requests/${selected.requestId}`, {
                      method: 'PUT',
                      body: JSON.stringify({
                        revision: selected.revision,
                        status: selected.status,
                        note: selected.note,
                      }),
                    });
                    setSelected({ ...selected, revision: result.revision });
                    await load();
                    setNotice('Статус и заметка сохранены.');
                  });
                }}
              >
                <div className="admin-toolbar">
                  <h2>{selected.requestId}</h2>
                  <button type="button" onClick={() => setSelected(null)}>
                    Закрыть
                  </button>
                </div>
                <p>
                  {date(selected.createdAt)} ·{' '}
                  {selected.kind === 'quote' ? 'Запрос КП' : 'Обращение'}
                </p>
                <dl className="admin-details">
                  {Object.entries(
                    selected.payload?.customer || selected.payload || {}
                  )
                    .filter(
                      ([key, v]) =>
                        typeof v !== 'object' &&
                        !['consentVersion'].includes(key)
                    )
                    .map(([key, value]) => (
                      <div key={key}>
                        <dt>
                          {{
                            name: 'Имя',
                            phone: 'Телефон',
                            email: 'Email',
                            comment: 'Комментарий',
                            source: 'Источник',
                            page: 'Страница',
                            contactChannel: 'Связаться через',
                            requestType: 'Тип обращения',
                            previousPhone: 'Прежний номер',
                          }[key] || key}
                        </dt>
                        <dd>{String(value || '—')}</dd>
                      </div>
                    ))}
                </dl>
                {selected.payload?.items?.length > 0 && (
                  <>
                    <h3>Состав заявки</h3>
                    <div className="admin-table-wrap">
                      <table>
                        <thead>
                          <tr>
                            <th>Товар</th>
                            <th>Количество</th>
                            <th>Цена из заявки</th>
                          </tr>
                        </thead>
                        <tbody>
                          {selected.payload.items.map((item, index) => (
                            <tr key={index}>
                              <td>
                                {item.title ||
                                  item.name ||
                                  item.sku ||
                                  `Позиция ${item.id || index + 1}`}
                              </td>
                              <td>
                                {item.quantity} {item.unit || 'м'}
                              </td>
                              <td>
                                {item.price == null
                                  ? 'По запросу'
                                  : money(item.price)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </>
                )}
                {selected.consent && (
                  <p className="admin-muted">
                    Согласие получено {date(selected.consent.receivedAt)}.
                    Редакция: {selected.consent.version}.
                  </p>
                )}
                {selected.attachments.map((file) => (
                  <p key={file.index}>
                    <a
                      href={`/api/admin/requests/${selected.requestId}/files/${file.index}`}
                    >
                      Скачать {file.filename}
                    </a>
                  </p>
                ))}
                <label className="admin-field">
                  <span>Статус</span>
                  <select
                    value={selected.status}
                    onChange={(e) => updateSelected('status', e.target.value)}
                  >
                    {Object.entries(statuses).map(([key, label]) => (
                      <option key={key} value={key}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
                <Field
                  label="Заметка владельца"
                  multiline
                  rows={4}
                  maxLength={5000}
                  value={selected.note}
                  onChange={(e) => updateSelected('note', e.target.value)}
                />
                <button className="admin-primary" disabled={busy}>
                  Сохранить
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    if (
                      window.confirm(
                        'Удалить заявку и все её вложения без возможности восстановления?'
                      )
                    )
                      perform(async () => {
                        await api(`requests/${selected.requestId}`, {
                          method: 'DELETE',
                          body: JSON.stringify({ revision: selected.revision }),
                        });
                        setSelected(null);
                        await load();
                        setNotice('Заявка и вложения удалены.');
                      });
                  }}
                >
                  Удалить заявку
                </button>
              </form>
            )}
          </div>
        )}
        {data && tab === 'products' && (
          <>
            <div className="admin-toolbar">
              <Field
                label="Поиск по названию или артикулу"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                  setSelected(null);
                }}
                type="search"
              />
              <button
                className="admin-primary"
                disabled={busy}
                onClick={() =>
                  setSelected({
                    isNew: true,
                    name: '',
                    sku: '',
                    price: '',
                    stock: '',
                    category: data.categories[0] || '',
                    description: '',
                    hidden: false,
                  })
                }
              >
                Добавить товар
              </button>
            </div>
            <div className={selected ? 'admin-split' : ''}>
              <section className="admin-panel">
                <p>Найдено товаров: {data.total.toLocaleString('ru-RU')}</p>
                <div className="admin-table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Товар</th>
                        <th>Цена</th>
                        <th>Остаток</th>
                        <th>Публикация</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.items.map((p) => (
                        <tr key={p.id}>
                          <td>
                            <button
                              className="admin-text-button"
                              disabled={loading || busy}
                              onClick={() =>
                                setSelected({
                                  ...p,
                                  description: p.description || '',
                                })
                              }
                            >
                              {p.name}
                            </button>
                            <small>
                              {p.sku}
                              {p.edited ? ' · Изменён' : ''}
                              {p.custom ? ' · Добавлен вручную' : ''}
                            </small>
                          </td>
                          <td>{money(p.price)}</td>
                          <td>
                            {p.stock} {p.unit}
                          </td>
                          <td>
                            {p.hidden
                              ? 'Скрыт'
                              : p.stock > 0
                                ? 'В каталоге'
                                : 'Нет остатка'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {!data.items.length && (
                  <p className="admin-empty">
                    По вашему запросу ничего не найдено.
                  </p>
                )}
                <div className="admin-pagination">
                  <button
                    disabled={page <= 1 || loading}
                    onClick={() => setPage(page - 1)}
                  >
                    ← Назад
                  </button>
                  <span>
                    {page} / {data.pages}
                  </span>
                  <button
                    disabled={page >= data.pages || loading}
                    onClick={() => setPage(page + 1)}
                  >
                    Далее →
                  </button>
                </div>
              </section>
              {selected && (
                <form
                  className="admin-panel admin-editor"
                  onSubmit={saveProduct}
                >
                  <div className="admin-toolbar">
                    <h2>{selected.isNew ? 'Новый товар' : 'Редактирование'}</h2>
                    <button type="button" onClick={() => setSelected(null)}>
                      Закрыть
                    </button>
                  </div>
                  <Field
                    label="Название"
                    value={selected.name}
                    maxLength={240}
                    required
                    onChange={(e) => updateSelected('name', e.target.value)}
                  />
                  {selected.isNew ? (
                    <>
                      <Field
                        label="Артикул"
                        required
                        maxLength={80}
                        value={selected.sku}
                        onChange={(e) => updateSelected('sku', e.target.value)}
                      />
                      <label className="admin-field">
                        <span>Категория</span>
                        <select
                          value={selected.category}
                          onChange={(e) =>
                            updateSelected('category', e.target.value)
                          }
                        >
                          {data.categories.map((c) => (
                            <option key={c}>{c}</option>
                          ))}
                        </select>
                      </label>
                    </>
                  ) : (
                    <p>
                      {selected.sku} · {selected.category}
                    </p>
                  )}
                  <div className="admin-two-fields">
                    <Field
                      label="Цена, ₽"
                      type="number"
                      min="0"
                      step="0.01"
                      required
                      value={selected.price}
                      onChange={(e) => updateSelected('price', e.target.value)}
                    />
                    <Field
                      label={`Остаток, ${selected.unit || 'м'}`}
                      type="number"
                      min="0"
                      step="any"
                      required
                      value={selected.stock}
                      onChange={(e) => updateSelected('stock', e.target.value)}
                    />
                  </div>
                  <Field
                    label="Описание товара"
                    multiline
                    rows={5}
                    maxLength={5000}
                    value={selected.description}
                    onChange={(e) =>
                      updateSelected('description', e.target.value)
                    }
                  />
                  <label className="admin-checkbox">
                    <input
                      type="checkbox"
                      checked={selected.hidden}
                      onChange={(e) =>
                        updateSelected('hidden', e.target.checked)
                      }
                    />
                    Скрыть с сайта
                  </label>
                  <p className="admin-muted">
                    Ручные правки сохраняются при следующем импорте прайса.
                    Товар без остатка не показывается в каталоге.
                  </p>
                  <button className="admin-primary" disabled={busy}>
                    Сохранить товар
                  </button>
                  {selected.edited && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => {
                        if (
                          window.confirm(
                            'Удалить ручные правки и вернуть данные из прайса?'
                          )
                        )
                          perform(async () => {
                            await api(`products/${selected.id}/override`, {
                              method: 'DELETE',
                              body: JSON.stringify({ revision: data.revision }),
                            });
                            setSelected(null);
                            await load();
                            setNotice('Данные прайса восстановлены.');
                          });
                      }}
                    >
                      Вернуть данные прайса
                    </button>
                  )}
                </form>
              )}
            </div>
          </>
        )}
        {data && tab === 'imports' && (
          <>
            <section className="admin-panel">
              <h2>Последний запуск</h2>
              {data.report ? (
                <>
                  <p>
                    {date(data.report.generatedAt)} ·{' '}
                    {importStatus(data.report.status)}
                  </p>
                  <>
                    <p>
                      {data.report.status === 'failed' || data.report.blocked
                        ? 'Новый прайс не опубликован. На сайте остаётся предыдущий каталог.'
                        : 'Результат последней обработки прайса.'}
                    </p>
                    <details>
                      <summary>Подробности отчёта</summary>
                      <p className="admin-technical">{data.report.message}</p>
                    </details>
                  </>
                  {data.report.blocked && (
                    <p className="admin-error">
                      Публикация импорта заблокирована
                    </p>
                  )}
                </>
              ) : (
                <p>Отчёта ещё нет.</p>
              )}
              <p className="admin-muted">
                Прайс обновляется действующим планировщиком. Здесь отображаются
                результаты его работы.
              </p>
            </section>
            {data.reviewRows.length > 0 && (
              <section className="admin-panel">
                <h2>Требуют проверки</h2>
                <div className="admin-table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Товар</th>
                        <th>Причина</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.reviewRows.map((r, i) => (
                        <tr key={i}>
                          <td>{r.product}</td>
                          <td>{r.reason}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            )}
            <section className="admin-panel">
              <h2>История запусков</h2>
              {!data.history.length ? (
                <p>Истории пока нет.</p>
              ) : (
                <div className="admin-table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Дата</th>
                        <th>Статус</th>
                        <th>Результат</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.history.map((r, i) => (
                        <tr key={i}>
                          <td>{date(r.generatedAt)}</td>
                          <td>{importStatus(r.status)}</td>
                          <td>{r.message || r.total || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </>
        )}
      </main>
    </div>
  );
}
