import Container from '../ui/Container';

const steps = [
  {
    title: 'Пришлите список позиций',
    description:
      'Укажите марки, сечения и нужное количество — сообщением или файлом.',
  },
  {
    title: 'Согласуем предложение',
    description:
      'Уточним наличие, стоимость и сроки поставки. Подготовим коммерческое предложение.',
  },
  {
    title: 'Оплата и отгрузка',
    description:
      'После согласования условий оформим документы и подготовим заказ к получению или отправке.',
  },
];

function StepIcon({ step }) {
  return (
    <svg
      viewBox="0 0 80 80"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {step === 2 ? (
        <>
          <path d="M9 55V20a3 3 0 0 1 3-3h35a3 3 0 0 1 3 3v35M50 31h12l10 14v15h-5M9 60h8M31 60h22" />
          <path d="M57 37h3l7 10H57V37ZM50 55h5M9 55h11" />
          <circle cx="24" cy="60" r="7" />
          <circle cx="60" cy="60" r="7" />
        </>
      ) : step === 1 ? (
        <>
          <path d="M46 7H16a4 4 0 0 0-4 4v57a4 4 0 0 0 4 4h21M46 7l16 16H46V7ZM62 23v13" />
          <path d="M24 31h25M24 41h16M24 51h9" />
          <circle cx="56" cy="58" r="17" />
          <path d="m48 58 6 6 11-12" />
        </>
      ) : (
        <>
          <path d="M50 7H16a4 4 0 0 0-4 4v57a4 4 0 0 0 4 4h46a4 4 0 0 0 4-4V23L50 7ZM50 7v16h16M32 31h20M32 44h20M32 57h20" />
          <circle cx="23" cy="31" r="1.5" />
          <circle cx="23" cy="44" r="1.5" />
          <circle cx="23" cy="57" r="1.5" />
        </>
      )}
    </svg>
  );
}

export default function OrderStepsVariants() {
  return (
    <>
      {['road', 'editorial'].map((variant) => (
        <section
          key={variant}
          className={`order-process order-process--${variant}`}
          aria-labelledby={`order-process-${variant}-title`}
        >
          <Container>
            <div className="order-process__layout">
              <h2 id={`order-process-${variant}-title`}>Как проходит заказ?</h2>
              <ol className="order-process__steps">
                {steps.map((step, index) => (
                  <li key={step.title}>
                    <div className="order-process__icon">
                      <StepIcon step={index} />
                    </div>
                    <h3>{step.title}</h3>
                    <p>{step.description}</p>
                  </li>
                ))}
              </ol>
            </div>
          </Container>
        </section>
      ))}
    </>
  );
}
