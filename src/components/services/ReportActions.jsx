import { useState } from 'react';
import { requestServiceHelp } from '../../lib/cableServices';

export function downloadTextFile(
  name,
  content,
  type = 'text/plain;charset=utf-8'
) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export default function ReportActions({
  title,
  text,
  requestText = text,
  disabled = false,
  requestLabel = 'Проверить с менеджером',
  csv,
}) {
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  async function pdf() {
    setMessage('');
    setBusy(true);
    try {
      const { downloadCalculationPdf } =
        await import('../../lib/calculationPdf');
      await downloadCalculationPdf(title, text);
    } catch {
      setMessage('Не удалось сохранить PDF. Скачайте текст расчёта.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="service-report-actions">
      <div className="services-actions">
        <button
          type="button"
          className="button-primary"
          disabled={disabled}
          onClick={() => requestServiceHelp(title, requestText)}
        >
          {requestLabel}
        </button>
        <button
          type="button"
          className="button-secondary"
          disabled={disabled || busy}
          onClick={pdf}
        >
          {busy ? 'Готовим PDF…' : 'Скачать PDF'}
        </button>
        <button
          type="button"
          className="button-secondary"
          disabled={disabled}
          onClick={() =>
            downloadTextFile('cable-calculation.txt', `${title}\n\n${text}`)
          }
        >
          Скачать текст
        </button>
        {csv && (
          <button
            type="button"
            className="button-secondary"
            disabled={disabled}
            onClick={() =>
              downloadTextFile(
                'cable-calculation.csv',
                `\uFEFF${csv}`,
                'text/csv;charset=utf-8'
              )
            }
          >
            Скачать CSV
          </button>
        )}
      </div>
      <p className="service-status" role="status">
        {message}
      </p>
    </div>
  );
}
