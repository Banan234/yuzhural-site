import { Link } from 'react-router-dom';

// Ссылки на прежнюю страницу спецификации открывают общую форму на месте.
export default function QuoteAction({
  to,
  children,
  onClick,
  source,
  ...props
}) {
  if (to?.split('?')[0].replace(/\/$/, '') !== '/specification') {
    return (
      <Link to={to} onClick={onClick} {...props}>
        {children}
      </Link>
    );
  }
  const comment =
    new URLSearchParams(to.split('?')[1] || '').get('request') || '';
  return (
    <button
      {...props}
      className={`quote-action ${props.className || ''}`}
      type="button"
      aria-haspopup="dialog"
      onClick={(event) => {
        onClick?.(event);
        window.dispatchEvent(
          new CustomEvent('open-quote-modal', {
            detail: { comment, source: source || 'Заявка по спецификации' },
          })
        );
      }}
    >
      {children}
    </button>
  );
}
