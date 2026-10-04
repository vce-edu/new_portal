import { forwardRef, useId } from "react";

const fieldBase =
  "w-full bg-transparent text-text placeholder:text-muted/60 focus:outline-none transition-colors disabled:text-muted/50 disabled:cursor-not-allowed";

const underline = (hasError) =>
  [
    "border-0 border-b-2 pb-2",
    hasError ? "border-red-400 focus:border-red-500" : "border-border focus:border-primary",
  ].join(" ");

function FieldShell({ label, hint, error, htmlFor, children }) {
  return (
    <div>
      {label && (
        <label htmlFor={htmlFor} className="block text-sm text-muted mb-1.5">
          {label}
        </label>
      )}
      {children}
      {(hint || error) && (
        <p className={`mt-1.5 text-sm ${error ? "text-red-500" : "text-muted"}`}>
          {error || hint}
        </p>
      )}
    </div>
  );
}

export const TextField = forwardRef(function TextField(
  { label, hint, error, id, className = "", ...props },
  ref
) {
  const autoId = useId();
  const fieldId = id || autoId;

  return (
    <FieldShell label={label} hint={hint} error={error} htmlFor={fieldId}>
      <input
        ref={ref}
        id={fieldId}
        className={[fieldBase, underline(!!error), className].join(" ")}
        aria-invalid={!!error}
        {...props}
      />
    </FieldShell>
  );
});

export const TextArea = forwardRef(function TextArea(
  { label, hint, error, id, rows = 4, className = "", ...props },
  ref
) {
  const autoId = useId();
  const fieldId = id || autoId;

  return (
    <FieldShell label={label} hint={hint} error={error} htmlFor={fieldId}>
      <textarea
        ref={ref}
        id={fieldId}
        rows={rows}
        className={[fieldBase, underline(!!error), "resize-none", className].join(" ")}
        aria-invalid={!!error}
        {...props}
      />
    </FieldShell>
  );
});

export const Select = forwardRef(function Select(
  { label, hint, error, id, className = "", children, ...props },
  ref
) {
  const autoId = useId();
  const fieldId = id || autoId;

  return (
    <FieldShell label={label} hint={hint} error={error} htmlFor={fieldId}>
      <div className="relative">
        <select
          ref={ref}
          id={fieldId}
          className={[
            fieldBase,
            underline(!!error),
            "appearance-none pr-6 cursor-pointer",
            className,
          ].join(" ")}
          aria-invalid={!!error}
          {...props}
        >
          {children}
        </select>
        <svg
          className="pointer-events-none absolute right-0 bottom-2.5 h-4 w-4 text-muted"
          viewBox="0 0 20 20"
          fill="none"
          aria-hidden="true"
        >
          <path d="M5 7.5L10 12.5L15 7.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
    </FieldShell>
  );
});

export const Checkbox = forwardRef(function Checkbox(
  { label, id, className = "", ...props },
  ref
) {
  const autoId = useId();
  const fieldId = id || autoId;

  return (
    <label htmlFor={fieldId} className="flex items-center gap-2.5 cursor-pointer select-none">
      <span className="relative flex h-[18px] w-[18px] shrink-0 items-center justify-center">
        <input
          ref={ref}
          id={fieldId}
          type="checkbox"
          className="peer absolute inset-0 h-full w-full cursor-pointer opacity-0"
          {...props}
        />
        <span
          className={[
            "h-full w-full rounded border-2 border-border transition-colors",
            "peer-checked:bg-primary peer-checked:border-primary",
            "peer-focus-visible:ring-2 peer-focus-visible:ring-primary/30 peer-focus-visible:ring-offset-1",
            className,
          ].join(" ")}
        />
        <svg
          className="pointer-events-none absolute h-3 w-3 text-white opacity-0 peer-checked:opacity-100 transition-opacity"
          viewBox="0 0 12 12"
          fill="none"
        >
          <path d="M2.5 6L5 8.5L9.5 3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
      {label && <span className="text-sm text-text">{label}</span>}
    </label>
  );
});