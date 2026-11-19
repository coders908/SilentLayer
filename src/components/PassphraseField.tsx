import { useId, useState } from 'react';
import { EyeIcon, EyeOffIcon, KeyIcon } from './Icons';

interface PassphraseFieldProps {
  value: string;
  onChange: (value: string) => void;
  label: string;
  hint?: string;
  placeholder?: string;
  minLength?: number;
  disabled?: boolean;
  autoFocus?: boolean;
}

function PassphraseField({
  value,
  onChange,
  label,
  hint,
  placeholder = 'Enter a passphrase',
  minLength,
  disabled = false,
  autoFocus = false,
}: PassphraseFieldProps) {
  const inputId = useId();
  const [isVisible, setIsVisible] = useState(false);

  const trimmedLength = value.trim().length;
  const isTooShort = minLength !== undefined && trimmedLength > 0 && trimmedLength < minLength;
  const strengthRatio = Math.min(1, trimmedLength / Math.max(minLength ?? 8, 16));

  return (
    <div className="field passphrase-field">
      <div className="passphrase-field__header">
        <label className="field__label" htmlFor={inputId}>
          {label}
        </label>
        <span className="optional-pill">Optional</span>
      </div>

      <div className="passphrase-field__control" data-invalid={isTooShort}>
        <KeyIcon size={15} className="passphrase-field__icon" />
        <input
          id={inputId}
          className="field__input passphrase-field__input"
          type={isVisible ? 'text' : 'password'}
          value={value}
          placeholder={placeholder}
          onChange={(event) => onChange(event.target.value)}
          disabled={disabled}
          autoFocus={autoFocus}
          autoComplete="new-password"
          spellCheck={false}
          dir="ltr"
        />
        <button
          className="passphrase-field__reveal"
          type="button"
          onClick={() => setIsVisible((current) => !current)}
          aria-label={isVisible ? 'Hide passphrase' : 'Show passphrase'}
          disabled={disabled}
        >
          {isVisible ? <EyeOffIcon size={15} /> : <EyeIcon size={15} />}
        </button>
      </div>

      {value.length > 0 && minLength !== undefined ? (
        <div className="passphrase-strength" aria-hidden="true">
          <span
            className="passphrase-strength__bar"
            style={{ transform: `scaleX(${strengthRatio})` }}
            data-level={strengthRatio >= 1 ? 'good' : strengthRatio >= 0.5 ? 'fair' : 'weak'}
          />
        </div>
      ) : null}

      {hint ? (
        <span className="field__hint" data-invalid={isTooShort}>
          {isTooShort ? `Use at least ${minLength} characters.` : hint}
        </span>
      ) : null}
    </div>
  );
}

export default PassphraseField;
