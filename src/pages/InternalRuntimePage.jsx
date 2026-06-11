// Файл рендерит внутреннюю страницу диагностики runtime и VK bridge.

import { useEffect, useMemo, useState } from 'react';
import Container from '../components/ui/Container';
import { useSEO } from '../hooks/useSEO';
import '../styles/pages/content.css';
import '../styles/pages/internal-runtime.css';

const INTERNAL_TOKEN_STORAGE_KEY = 'yuzhural-internal-metrics-token';
const AUTO_REFRESH_INTERVAL_MS = 15_000;
const VK_HEALTH_FATAL_STATUSES = [401, 404];

function formatDateTime(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat('ru-RU', {
    dateStyle: 'short',
    timeStyle: 'medium',
  }).format(date);
}

function formatBoolean(value) {
  return value ? 'Да' : 'Нет';
}

function formatList(items) {
  return Array.isArray(items) && items.length > 0 ? items.join(', ') : '—';
}

function getStatusTone(status) {
  switch (status) {
    case 'ready':
      return 'ok';
    case 'degraded':
    case 'tunnel_or_ephemeral':
      return 'warn';
    case 'callback_unreachable':
    case 'callback_unconfigured':
    case 'unavailable':
      return 'bad';
    default:
      return 'neutral';
  }
}

function readStoredToken() {
  let sessionToken = '';

  try {
    sessionToken =
      window.sessionStorage.getItem(INTERNAL_TOKEN_STORAGE_KEY) || '';
  } catch {
    // ignore sessionStorage failures on internal diagnostics page
  }

  if (sessionToken) {
    try {
      window.localStorage.removeItem(INTERNAL_TOKEN_STORAGE_KEY);
    } catch {
      // ignore legacy localStorage failures on internal diagnostics page
    }
    return sessionToken;
  }

  try {
    const legacyToken =
      window.localStorage.getItem(INTERNAL_TOKEN_STORAGE_KEY) || '';
    if (!legacyToken) return '';

    try {
      window.sessionStorage.setItem(INTERNAL_TOKEN_STORAGE_KEY, legacyToken);
    } catch {
      // ignore sessionStorage failures on internal diagnostics page
    }

    window.localStorage.removeItem(INTERNAL_TOKEN_STORAGE_KEY);
    return legacyToken;
  } catch {
    // ignore legacy localStorage failures on internal diagnostics page
    return '';
  }
}

async function fetchJson(url, token, { fatalStatuses = null } = {}) {
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  const data = await response.json();

  if (!response.ok) {
    if (
      Array.isArray(fatalStatuses) &&
      !fatalStatuses.includes(response.status)
    ) {
      return data;
    }

    const message = data?.message || `HTTP ${response.status}`;
    throw new Error(message);
  }

  return data;
}

function StatusBadge({ tone = 'neutral', children }) {
  return (
    <span
      className={`internal-runtime__badge internal-runtime__badge--${tone}`}
    >
      {children}
    </span>
  );
}

function MetricRow({ label, value }) {
  return (
    <div className="internal-runtime__metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

export default function InternalRuntimePage() {
  useSEO({
    title: 'Internal Runtime',
    description: 'Внутренняя диагностика runtime и VK callback bridge.',
    canonical: false,
    noindex: true,
  });

  const [token, setToken] = useState('');
  const [draftToken, setDraftToken] = useState('');
  const [runtimeData, setRuntimeData] = useState(null);
  const [vkData, setVkData] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isRefreshingProbe, setIsRefreshingProbe] = useState(false);
  const [error, setError] = useState('');
  const [lastLoadedAt, setLastLoadedAt] = useState('');
  const [reloadNonce, setReloadNonce] = useState(0);

  useEffect(() => {
    const stored = readStoredToken();
    setToken(stored);
    setDraftToken(stored);
  }, []);

  async function loadDiagnostics(nextToken, { refreshProbe = false } = {}) {
    if (!nextToken) {
      setError('Укажите INTERNAL_METRICS_TOKEN.');
      return;
    }

    const vkUrl = refreshProbe ? '/api/vk/health?refresh=1' : '/api/vk/health';
    setError('');
    setIsLoading(!refreshProbe);
    setIsRefreshingProbe(refreshProbe);
    try {
      const [runtimeResponse, vkResponse] = await Promise.all([
        fetchJson('/api/runtime', nextToken),
        fetchJson(vkUrl, nextToken, {
          fatalStatuses: VK_HEALTH_FATAL_STATUSES,
        }),
      ]);
      setRuntimeData(runtimeResponse);
      setVkData(vkResponse);
      setLastLoadedAt(new Date().toISOString());
    } catch (loadError) {
      setError(loadError.message || 'Не удалось загрузить диагностику.');
    } finally {
      setIsLoading(false);
      setIsRefreshingProbe(false);
    }
  }

  useEffect(() => {
    if (!token) return undefined;

    void loadDiagnostics(token);
    const timer = window.setInterval(() => {
      void loadDiagnostics(token);
    }, AUTO_REFRESH_INTERVAL_MS);

    return () => window.clearInterval(timer);
  }, [reloadNonce, token]);

  function handleSaveToken(event) {
    event.preventDefault();
    const nextToken = draftToken.trim();
    const shouldForceReload = nextToken && nextToken === token;
    setToken(nextToken);
    if (shouldForceReload) {
      setReloadNonce((value) => value + 1);
    }
    try {
      if (nextToken) {
        window.sessionStorage.setItem(INTERNAL_TOKEN_STORAGE_KEY, nextToken);
      } else {
        window.sessionStorage.removeItem(INTERNAL_TOKEN_STORAGE_KEY);
      }
      window.localStorage.removeItem(INTERNAL_TOKEN_STORAGE_KEY);
    } catch {
      // ignore browser storage failures on internal diagnostics page
    }
    if (!nextToken) {
      setError('Укажите INTERNAL_METRICS_TOKEN.');
    }
  }

  const vkStatus = vkData?.status || 'unavailable';
  const vkStatusTone = getStatusTone(vkStatus);
  const publicEndpoint = vkData?.vk?.callback?.publicEndpoint || {};
  const runtimeVk = vkData?.vk?.runtime || {};
  const autoConfigure = vkData?.vk?.callback?.autoConfigure || {};

  const runtimeCards = useMemo(
    () => [
      {
        title: 'Runtime',
        metrics: [
          ['Node.js', runtimeData?.runtime?.node || '—'],
          ['PID', runtimeData?.runtime?.pid || '—'],
          [
            'Uptime',
            runtimeData ? `${Math.round(runtimeData.uptime)} сек` : '—',
          ],
          ['Активные запросы', runtimeData?.runtime?.activeRequests ?? '—'],
        ],
      },
      {
        title: 'VK bridge',
        metrics: [
          ['Manager peer', vkData?.vk?.managerPeerId || '—'],
          ['Manager allowlist', formatList(vkData?.vk?.managerUserIds)],
          ['Последний success', formatDateTime(runtimeVk.lastSuccessfulAt)],
          [
            'Последний secret mismatch',
            formatDateTime(runtimeVk.lastSecretMismatchAt),
          ],
        ],
      },
      {
        title: 'Callback URL',
        metrics: [
          ['Exposure', publicEndpoint.exposure || '—'],
          ['Tunnel provider', publicEndpoint.tunnelProvider || '—'],
          [
            'Stable public entry',
            formatBoolean(publicEndpoint.isStablePublicEntryPoint),
          ],
          ['Operational risk', publicEndpoint.operationalRisk || '—'],
        ],
      },
    ],
    [publicEndpoint, runtimeData, runtimeVk, vkData]
  );

  return (
    <>
      <section className="section">
        <Container>
          <div className="internal-runtime__hero">
            <div>
              <h1 className="page-title">Internal Runtime</h1>
              <p className="page-subtitle">
                Внутренний экран диагностики для runtime, SMTP и VK callback
                bridge.
              </p>
            </div>

            <div className="internal-runtime__hero-card">
              <div className="internal-runtime__hero-top">
                <span className="internal-runtime__hero-label">
                  VK callback
                </span>
                <StatusBadge tone={vkStatusTone}>{vkStatus}</StatusBadge>
              </div>
              <div className="internal-runtime__hero-value">
                {vkData?.vk?.callback?.url || 'URL не настроен'}
              </div>
              <div className="internal-runtime__hero-meta">
                <span>
                  Последнее обновление: {formatDateTime(lastLoadedAt)}
                </span>
                <span>
                  Последний probe: {formatDateTime(publicEndpoint.lastProbeAt)}
                </span>
              </div>
            </div>
          </div>
        </Container>
      </section>

      <section className="section section--soft">
        <Container>
          <form
            className="internal-runtime__toolbar"
            onSubmit={handleSaveToken}
          >
            <label className="internal-runtime__field">
              <span>INTERNAL_METRICS_TOKEN</span>
              <input
                type="password"
                value={draftToken}
                onChange={(event) => setDraftToken(event.target.value)}
                placeholder="Введите внутренний токен"
                autoComplete="off"
              />
            </label>
            <div className="internal-runtime__actions">
              <button type="submit" className="internal-runtime__button">
                Сохранить и обновить
              </button>
              <button
                type="button"
                className="internal-runtime__button internal-runtime__button--secondary"
                onClick={() => void loadDiagnostics(token)}
                disabled={!token || isLoading}
              >
                Обновить
              </button>
              <button
                type="button"
                className="internal-runtime__button internal-runtime__button--secondary"
                onClick={() =>
                  void loadDiagnostics(token, { refreshProbe: true })
                }
                disabled={!token || isRefreshingProbe}
              >
                Проверить callback URL
              </button>
            </div>
          </form>

          {error ? (
            <div className="internal-runtime__error">{error}</div>
          ) : null}

          <div className="internal-runtime__grid">
            {runtimeCards.map((card) => (
              <article key={card.title} className="internal-runtime__card">
                <h2 className="internal-runtime__card-title">{card.title}</h2>
                <div className="internal-runtime__metrics">
                  {card.metrics.map(([label, value]) => (
                    <MetricRow key={label} label={label} value={value} />
                  ))}
                </div>
              </article>
            ))}
          </div>
        </Container>
      </section>

      <section className="section">
        <Container>
          <div className="internal-runtime__panels">
            <article className="internal-runtime__card">
              <div className="internal-runtime__card-head">
                <h2 className="internal-runtime__card-title">
                  VK callback runtime
                </h2>
                <StatusBadge tone={publicEndpoint.healthy ? 'ok' : 'warn'}>
                  {publicEndpoint.healthy ? 'healthy' : 'attention'}
                </StatusBadge>
              </div>
              <div className="internal-runtime__metrics">
                <MetricRow
                  label="Последний успешный callback"
                  value={formatDateTime(runtimeVk.lastSuccessfulAt)}
                />
                <MetricRow
                  label="Тип последнего success"
                  value={runtimeVk.lastSuccessfulType || '—'}
                />
                <MetricRow
                  label="Последний conversationId"
                  value={runtimeVk.lastSuccessfulConversationId || '—'}
                />
                <MetricRow
                  label="Total success"
                  value={runtimeVk.totalSuccessful ?? '—'}
                />
                <MetricRow
                  label="Total rejected"
                  value={runtimeVk.totalRejected ?? '—'}
                />
                <MetricRow
                  label="Secret mismatch count"
                  value={runtimeVk.secretMismatchCount ?? '—'}
                />
                <MetricRow
                  label="Consecutive probe failures"
                  value={publicEndpoint.consecutiveFailures ?? '—'}
                />
                <MetricRow
                  label="Total probes"
                  value={publicEndpoint.totalProbes ?? '—'}
                />
              </div>
            </article>

            <article className="internal-runtime__card">
              <div className="internal-runtime__card-head">
                <h2 className="internal-runtime__card-title">
                  Auto-config и probe
                </h2>
                <StatusBadge tone={autoConfigure.lastError ? 'bad' : 'neutral'}>
                  {vkData?.vk?.callback?.autoConfigureEnabled
                    ? 'enabled'
                    : 'disabled'}
                </StatusBadge>
              </div>
              <div className="internal-runtime__metrics">
                <MetricRow
                  label="Последняя попытка auto-config"
                  value={formatDateTime(autoConfigure.lastAttemptAt)}
                />
                <MetricRow
                  label="Последний успех auto-config"
                  value={formatDateTime(autoConfigure.lastSuccessAt)}
                />
                <MetricRow
                  label="Последняя ошибка auto-config"
                  value={autoConfigure.lastError?.message || '—'}
                />
                <MetricRow
                  label="Последний probe HTTP status"
                  value={publicEndpoint.lastHttpStatus ?? '—'}
                />
                <MetricRow
                  label="Body matched confirmation"
                  value={
                    publicEndpoint.lastBodyMatched == null
                      ? '—'
                      : formatBoolean(publicEndpoint.lastBodyMatched)
                  }
                />
                <MetricRow
                  label="Последняя ошибка probe"
                  value={publicEndpoint.lastError?.message || '—'}
                />
              </div>
            </article>
          </div>
        </Container>
      </section>
    </>
  );
}
