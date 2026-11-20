'use client';

import { useContext } from 'react';
import FormErrorsContext from '@/components/FormErrorsContext';

export default function Field({ label, name, type = 'text', required = true, hint, error, ...rest }) {
  const fieldErrors = useContext(FormErrorsContext);
  const message = error || fieldErrors?.[name];
  const hintId = hint ? `${name}-hint` : undefined;
  const errorId = message ? `${name}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined;

  return (
    <div>
      <label htmlFor={name} className="label">
        {label}{required && <span className="ml-0.5 text-bad-700" aria-hidden="true">*</span>}
      </label>
      <input
        id={name}
        name={name}
        type={type}
        required={required}
        aria-invalid={message ? 'true' : undefined}
        aria-describedby={describedBy}
        className={`input ${message ? 'border-bad-700 focus:border-bad-700' : ''}`}
        {...rest}
      />
      {hint && <p id={hintId} className="hint">{hint}</p>}
      {message && <p id={errorId} role="alert" className="mt-1 text-xs font-medium text-bad-700">{message}</p>}
    </div>
  );
}
