import {
  SPECIFICATION_ACCEPT,
  SPECIFICATION_FILE_HINT,
  validateSpecificationFiles,
} from '../../../shared/specificationFiles';
export default function SpecificationFiles({
  files,
  onChange,
  error,
  onError,
  id,
  disabled,
}) {
  function select(event) {
    const added = Array.from(event.target.files || []);
    const next = [...files, ...added].filter(
      (file, index, all) =>
        all.findIndex(
          (item) =>
            item.name === file.name &&
            item.size === file.size &&
            item.lastModified === file.lastModified
        ) === index
    );
    const message = validateSpecificationFiles(next);
    onError(message);
    if (!message) onChange(next);
    event.target.value = '';
  }
  return (
    <div className="specification-files">
      <label htmlFor={id}>Прикрепить спецификацию</label>
      <p id={`${id}-hint`}>
        {SPECIFICATION_FILE_HINT}. Файлы отправятся вместе с заявкой после
        нажатия кнопки.
      </p>
      <input
        id={id}
        type="file"
        accept={SPECIFICATION_ACCEPT}
        multiple
        onChange={select}
        disabled={disabled}
        aria-invalid={error ? true : undefined}
        aria-describedby={`${id}-hint${error ? ` ${id}-error` : ''}`}
      />
      {files.length > 0 && (
        <ul
          className="specification-files__list"
          aria-label="Прикреплённые файлы"
        >
          {files.map((file, index) => (
            <li key={`${file.name}-${index}`}>
              <span>
                {file.name}{' '}
                <small>
                  {(file.size / 1024).toLocaleString('ru-RU', {
                    maximumFractionDigits: 0,
                  })}{' '}
                  КБ
                </small>
              </span>
              <button
                type="button"
                disabled={disabled}
                aria-label={`Убрать файл ${file.name}`}
                onClick={() => {
                  onChange(files.filter((_, i) => i !== index));
                  onError('');
                }}
              >
                Убрать
              </button>
            </li>
          ))}
        </ul>
      )}
      {error && (
        <p id={`${id}-error`} className="field-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
