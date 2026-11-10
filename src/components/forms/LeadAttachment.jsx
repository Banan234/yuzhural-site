import { useRef, useState } from 'react';
import {
  SPECIFICATION_ACCEPT,
  validateSpecificationFiles,
} from '../../../shared/specificationFiles.js';
import '../../styles/components/lead-attachment.css';

export default function LeadAttachment({
  id,
  file,
  onChange,
  disabled,
  multiple = false,
}) {
  const files = Array.isArray(file) ? file : file ? [file] : [];
  const fileRef = useRef(null);
  const [fileError, setFileError] = useState('');
  return (
    <div>
      <div className="home-contact-form__attachment">
        <input
          ref={fileRef}
          id={id}
          className="visually-hidden"
          type="file"
          multiple={multiple}
          accept={SPECIFICATION_ACCEPT}
          disabled={disabled}
          aria-describedby={`${id}-hint${fileError ? ` ${id}-error` : ''}`}
          aria-invalid={fileError ? true : undefined}
          onChange={(event) => {
            if (multiple) {
              const next = [
                ...files,
                ...Array.from(event.target.files || []),
              ].filter(
                (item, index, all) =>
                  all.findIndex(
                    (other) =>
                      other.name === item.name &&
                      other.size === item.size &&
                      other.lastModified === item.lastModified
                  ) === index
              );
              const error = validateSpecificationFiles(next);
              setFileError(error);
              if (!error) onChange(next);
              event.target.value = '';
              return;
            }
            const selected = event.target.files?.[0];
            const error = selected
              ? validateSpecificationFiles([selected])
              : '';
            setFileError(error);
            if (selected && !error) onChange(selected);
            event.target.value = '';
          }}
        />
        <label htmlFor={id} className="home-contact-form__file-label">
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
          </svg>
          <span>
            {multiple
              ? 'Прикрепить файлы'
              : file
                ? file.name
                : 'Прикрепить файл'}
          </span>
        </label>
        {file && !multiple && (
          <button
            type="button"
            className="home-contact-form__file-remove"
            aria-label={`Удалить файл ${file.name}`}
            disabled={disabled}
            onClick={() => {
              onChange(null);
              setFileError('');
              fileRef.current?.focus();
            }}
          >
            ×
          </button>
        )}
        <small id={`${id}-hint`}>
          PDF, XLS, XLSX · {multiple ? 'до 3 файлов по 7 МБ' : 'до 7 МБ'}
        </small>
      </div>
      {multiple && files.length > 0 && (
        <ul className="lead-attachment-list" aria-label="Прикреплённые файлы">
          {files.map((item, index) => (
            <li key={`${item.name}-${index}`}>
              <span>
                {item.name}{' '}
                <small>{Math.max(1, Math.ceil(item.size / 1024))} КБ</small>
              </span>
              <button
                type="button"
                className="home-contact-form__file-remove"
                disabled={disabled}
                aria-label={`Удалить файл ${item.name}`}
                onClick={() => {
                  onChange(files.filter((_, i) => i !== index));
                  setFileError('');
                  fileRef.current?.focus();
                }}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
      {fileError && (
        <span id={`${id}-error`} className="field-error" role="alert">
          {fileError}
        </span>
      )}
    </div>
  );
}
