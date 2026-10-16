// Все точки заказа звонка открывают одну форму с явным источником обращения.
export default function CallbackButton({ source, className, onOpen }) {
  return (
    <button
      type="button"
      className={className}
      aria-haspopup="dialog"
      onClick={() => {
        onOpen?.();
        window.dispatchEvent(
          new CustomEvent('open-lead-modal', {
            detail: {
              mode: 'callback',
              title: 'Заказать звонок',
              subtitle:
                'Оставьте номер — менеджер свяжется с вами в рабочее время.',
              submitLabel: 'Жду звонка',
              source,
            },
          })
        );
      }}
    >
      Заказать звонок
    </button>
  );
}
