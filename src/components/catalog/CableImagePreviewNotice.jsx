import { useLocation } from 'react-router-dom';
import { isCableImagePreview } from '../../lib/cableImagePreview.js';
export default function CableImagePreviewNotice() {
  const location = useLocation();
  if (
    !isCableImagePreview({
      location: {
        hostname: globalThis.window?.location.hostname,
        search: location.search,
      },
    })
  )
    return null;
  return (
    <aside
      role="status"
      data-cable-image-preview
      style={{
        background: '#fff1d6',
        color: '#604413',
        padding: '12px 24px',
        borderBottom: '1px solid #decfa9',
      }}
    >
      Локальный предпросмотр контрольных иллюстраций. Статусы указаны в отчёте.
      Действующие изображения товаров и привязки не изменены.
    </aside>
  );
}
