import { useEffect, useId, useRef, type ButtonHTMLAttributes, type HTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes } from 'react';

export type Tone = 'neutral' | 'success' | 'warning' | 'danger' | 'info';
export function Button({ variant = 'primary', busy = false, children, className = '', disabled, type = 'button', ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'danger' | 'ghost'; busy?: boolean }) {
  return <button {...props} type={type} disabled={disabled || busy} aria-busy={busy || undefined} className={`wp-button wp-button--${variant} ${className}`}>{busy && <span className="wp-spinner" aria-hidden="true" />}{children}</button>;
}
export function Badge({ tone = 'neutral', children }: { tone?: Tone; children: ReactNode }) {
  return <span className={`wp-badge wp-tone--${tone}`}>{children}</span>;
}
export function Card({ children, className = '', ...props }: HTMLAttributes<HTMLElement>) {
  return <section {...props} className={`wp-card ${className}`}>{children}</section>;
}
export function PageHeading({ title, description, eyebrow, actions }: { title: string; description?: string; eyebrow?: string; actions?: ReactNode }) {
  return <div className="wp-page-heading"><div>{eyebrow && <p className="wp-eyebrow">{eyebrow}</p>}<h1>{title}</h1>{description && <p className="wp-description">{description}</p>}</div>{actions && <div className="wp-actions">{actions}</div>}</div>;
}
export function AlertBanner({ tone = 'info', title, children, action }: { tone?: Tone; title: string; children?: ReactNode; action?: ReactNode }) {
  return <div className={`wp-alert wp-tone--${tone}`} role={tone === 'danger' ? 'alert' : 'status'}><span className="wp-alert-symbol" aria-hidden="true">{tone === 'success' ? '✓' : tone === 'warning' || tone === 'danger' ? '!' : 'i'}</span><div><strong>{title}</strong>{children && <div className="wp-alert-detail">{children}</div>}</div>{action && <div className="wp-alert-action">{action}</div>}</div>;
}
export function TextField({ label, hint, error, id, ...props }: InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: string; error?: string }) {
  const generated = useId(); const fieldId = id || generated;
  return <div className="wp-field"><label htmlFor={fieldId}>{label}</label><input {...props} id={fieldId} aria-invalid={!!error || undefined} aria-describedby={error || hint ? `${fieldId}-help` : undefined} />{(error || hint) && <small id={`${fieldId}-help`} className={error ? 'wp-field-error' : ''}>{error || hint}</small>}</div>;
}
export function SelectField({ label, id, children, ...props }: SelectHTMLAttributes<HTMLSelectElement> & { label: string }) {
  const generated = useId(); const fieldId = id || generated;
  return <div className="wp-field"><label htmlFor={fieldId}>{label}</label><select {...props} id={fieldId}>{children}</select></div>;
}
export function MetricCard({ label, value, detail, badge }: { label: string; value: ReactNode; detail?: string; badge?: ReactNode }) {
  return <Card className="wp-metric"><p className="wp-eyebrow">{label}</p><div className="wp-metric-value">{value}{badge}</div>{detail && <p className="wp-metric-detail">{detail}</p>}</Card>;
}
export function CapacityBar({ label, value, maximum, unit = '', tone = 'info' }: { label: string; value: number; maximum: number; unit?: string; tone?: Tone }) {
  const percent = maximum > 0 ? Math.max(0, Math.min(value / maximum * 100, 100)) : 0;
  return <div className="wp-capacity"><div><span>{label}</span><strong>{value.toLocaleString()} / {maximum.toLocaleString()} {unit}</strong></div><div className={`wp-capacity-track wp-tone--${tone}`} role="progressbar" aria-label={label} aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100} aria-valuetext={`${value} of ${maximum} ${unit}`}><span style={{ width: `${percent}%` }} /></div></div>;
}
export function SegmentedControl({ label, options, value, onChange }: { label: string; options: { value: string; label: string }[]; value: string; onChange: (value: string) => void }) {
  return <div className="wp-segmented" role="group" aria-label={label}>{options.map(option => <button type="button" key={option.value} aria-pressed={value === option.value} onClick={() => onChange(option.value)}>{option.label}</button>)}</div>;
}
export function Pagination({ page, pageSize, total, onChange }: { page: number; pageSize: number; total: number; onChange: (page: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / Math.max(1, pageSize)));
  const current = Math.max(1, Math.min(page, pages));
  return <nav className="wp-pagination" aria-label="Pagination"><span aria-live="polite">{total ? `${(current - 1) * pageSize + 1}–${Math.min(current * pageSize, total)}` : '0'} of {total}</span><div><Button variant="secondary" disabled={current <= 1} onClick={() => onChange(current - 1)}>Previous</Button><span>Page {current} of {pages}</span><Button variant="secondary" disabled={current >= pages} onClick={() => onChange(current + 1)}>Next</Button></div></nav>;
}
export function EmptyState({ title, description, action }: { title: string; description: string; action?: ReactNode }) {
  return <div className="wp-empty"><h3>{title}</h3><p>{description}</p>{action}</div>;
}
export function Modal({ open, onClose, title, description, children, footer }: { open: boolean; onClose: () => void; title: string; description?: string; children: ReactNode; footer?: ReactNode }) {
  const dialog = useRef<HTMLDialogElement>(null); const titleId = useId(); const descriptionId = useId();
  useEffect(() => {
    const node = dialog.current;
    if (!open || !node) return;
    const previousFocus = document.activeElement as HTMLElement | null;
    node.showModal();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { node.close(); document.body.style.overflow = previousOverflow; previousFocus?.focus(); };
  }, [open]);
  return <dialog ref={dialog} className="wp-modal" aria-labelledby={titleId} aria-describedby={description ? descriptionId : undefined} onKeyDown={event => {
    if (event.key !== 'Tab') return;
    const controls = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]')).filter(node => node.getClientRects().length > 0);
    const first = controls[0]; const last = controls[controls.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
  }} onCancel={event => { event.preventDefault(); onClose(); }} onClick={event => { if (event.target === event.currentTarget) { const rect = event.currentTarget.getBoundingClientRect(); if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) onClose(); } }}>
    <div className="wp-modal-header"><div><h2 id={titleId}>{title}</h2>{description && <p id={descriptionId}>{description}</p>}</div><Button variant="ghost" aria-label="Close dialog" onClick={onClose}>×</Button></div><div className="wp-modal-body">{children}</div>{footer && <div className="wp-modal-footer">{footer}</div>}
  </dialog>;
}
