'use client';
import { useEffect, useRef } from 'react';
import { useFormState, useFormStatus } from 'react-dom';

export function SubmitButton({ children, className = 'btn-primary', pendingText = 'Please wait…', name, value }) {
  const { pending } = useFormStatus();

  // For forms with several submit buttons (e.g. Approve / Reject): write the chosen value into a
  // hidden input at click time, so it is part of the FormData whichever way React forwards submitters.
  function onClick(e) {
    if (!name) return;
    const form = e.currentTarget.form;
    if (!form) return;
    let input = form.querySelector(`input[data-submitter="${name}"]`);
    if (!input) {
      input = document.createElement('input');
      input.type = 'hidden';
      input.name = name;
      input.setAttribute('data-submitter', name);
      form.appendChild(input);
    }
    input.value = value;
  }

  return (
    <button type="submit" onClick={onClick} disabled={pending} className={className}>
      {pending ? pendingText : children}
    </button>
  );
}

/**
 * Wraps a server action (prevState, formData) => { ok?, message?, error? }.
 * Shows the result under the form; resets fields after success when resetOnSuccess is set.
 */
export default function ActionForm({ action, children, className = '', resetOnSuccess = false, onResult }) {
  const [state, formAction] = useFormState(action, null);
  const ref = useRef(null);
  const onResultRef = useRef(onResult);
  onResultRef.current = onResult;

  // Runs once per action result (state identity changes only when the action returns).
  useEffect(() => {
    if (!state) return;
    if (state.ok && resetOnSuccess) ref.current?.reset();
    onResultRef.current?.(state);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  return (
    <form ref={ref} action={formAction} className={className}>
      {children}
      {state?.error && (
        <p role="alert" className="mt-3 rounded-lg bg-bad-100 px-3 py-2 text-sm text-bad-700">{state.error}</p>
      )}
      {state?.ok && state?.message && (
        <p role="status" className="mt-3 rounded-lg bg-ok-100 px-3 py-2 text-sm text-ok-700">{state.message}</p>
      )}
    </form>
  );
}
