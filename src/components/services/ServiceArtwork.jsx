// Декоративные технические иллюстрации для карточек сервисов.
export default function ServiceArtwork({ type }) {
  const artwork = {
    application: (
      <>
        <path d="M28 145h45V88h43V38h62M73 116h95M116 63h62" />
        <circle cx="178" cy="38" r="13" />
        <circle cx="178" cy="116" r="13" />
        <path d="m166 160 20 20 35-43M29 173v22h83" />
        <circle cx="28" cy="145" r="8" />
      </>
    ),
    section: (
      <>
        <circle cx="126" cy="115" r="79" />
        <circle cx="126" cy="115" r="64" />
        <circle cx="126" cy="83" r="20" />
        <circle cx="99" cy="132" r="20" />
        <circle cx="153" cy="132" r="20" />
        <path d="M70 171 182 59M62 163l16 16M174 51l16 16" />
      </>
    ),
    weight: (
      <>
        <path d="M37 88h155l16 109H22ZM79 88a36 36 0 0 1 72 0" />
        <circle cx="115" cy="144" r="31" />
        <path d="m115 144 16-20M64 62H25M45 45 25 62l20 17M198 39v57M185 39h26M185 96h26" />
      </>
    ),
    marking: (
      <>
        <path d="m21 109 53-62 126 31-33 123L39 170Z" />
        <circle cx="65" cy="87" r="9" />
        <path d="m87 95 81 20M76 119l59 15M64 144l82 21M18 47l28 18M38 27l22 26" />
        <path d="m185 165 23 6M176 189l16 17" />
      </>
    ),
    reference: (
      <>
        <path d="M116 61C83 38 48 43 22 51v132c28-9 61-12 94 10 33-22 66-19 94-10V51c-26-8-61-13-94 10ZM116 61v132M41 78l55 7M41 102l55 8M41 127l55 9M136 84l53-6M136 110l53-8M136 136l53-9" />
      </>
    ),
    analogs: (
      <>
        <circle cx="67" cy="80" r="44" />
        <circle cx="67" cy="68" r="12" />
        <circle cx="53" cy="91" r="12" />
        <circle cx="81" cy="91" r="12" />
        <circle cx="173" cy="158" r="44" />
        <circle cx="160" cy="145" r="11" />
        <circle cx="186" cy="145" r="11" />
        <circle cx="160" cy="172" r="11" />
        <circle cx="186" cy="172" r="11" />
        <path d="M125 49h65v42m-17-17 17 17 17-17M111 187H46v-38m-17 17 17-17 17 17" />
      </>
    ),
    drum: (
      <>
        <ellipse cx="74" cy="119" rx="45" ry="76" />
        <ellipse cx="158" cy="119" rx="45" ry="76" />
        <ellipse cx="158" cy="119" rx="17" ry="29" />
        <path d="m74 43 84 0M74 195h84M62 69l66-1M48 96l67-1M47 124l66-1M51 152h67M64 177h66M203 119v75h20" />
      </>
    ),
    shipping: (
      <>
        <path d="M18 79h129v100H18ZM147 112h37l33 35v32h-70M164 126v23h39" />
        <circle cx="57" cy="181" r="19" />
        <circle cx="179" cy="181" r="19" />
        <path d="M33 97h95M33 110h74" />
        <ellipse cx="80" cy="147" rx="24" ry="26" />
        <ellipse cx="80" cy="147" rx="9" ry="12" />
      </>
    ),
    manufacturers: (
      <>
        <path d="M20 191V99l55-30v30l55-30v40l37-20 36 19v83ZM42 86V30h26v42M37 135h23v26H37ZM86 135h23v26H86ZM138 135h23v26h-23ZM182 135h9M20 191h193" />
        <path d="M48 13h30M91 26h24M121 13h33" />
      </>
    ),
  };
  return (
    <svg
      className="service-card__art"
      viewBox="0 0 240 230"
      fill="none"
      stroke="currentColor"
      strokeWidth="3"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {artwork[type]}
    </svg>
  );
}
