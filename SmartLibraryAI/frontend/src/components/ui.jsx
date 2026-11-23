import { useEffect } from "react";
import { BookOpen, Check, X } from "lucide-react";

export function PageHeader({ eyebrow, title, description, actions }) {
  return (
    <div className="page-heading">
      <div>
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h1>{title}</h1>
        {description && <p className="page-description">{description}</p>}
      </div>
      {actions && <div className="page-heading-actions">{actions}</div>}
    </div>
  );
}

export function StatCard({ icon: Icon, label, value, change, tone = "blue" }) {
  return (
    <article className="stat-card">
      <div className={`stat-icon tone-${tone}`}><Icon size={20} strokeWidth={2} /></div>
      <div className="stat-content">
        <span className="stat-label">{label}</span>
        <div className="stat-value-row">
          <strong>{value}</strong>
          {change && <span className="stat-change"><Check size={12} /> {change}</span>}
        </div>
      </div>
    </article>
  );
}

export function Badge({ children, tone = "neutral", dot = false }) {
  return <span className={`badge badge-${tone}`}>{dot && <i />}{children}</span>;
}

export function Avatar({ name = "Bạn đọc", tone = "blue", size = "normal" }) {
  const initials = name
    .trim()
    .split(/\s+/)
    .slice(-2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
  return <span className={`avatar avatar-${tone} avatar-${size}`}>{initials}</span>;
}

export function BookCover({ title, tone = "blue", compact = false }) {
  return (
    <span className={`book-cover cover-${tone}${compact ? " book-cover-compact" : ""}`} aria-label={`Bìa mẫu: ${title}`}>
      <BookOpen size={compact ? 17 : 23} strokeWidth={1.7} />
      {!compact && <span className="book-cover-lines"><i /><i /><i /></span>}
    </span>
  );
}

export function SearchField({ value, onChange, placeholder = "Tìm kiếm...", className = "" }) {
  return (
    <label className={`search-field ${className}`}>
      <span className="sr-only">{placeholder}</span>
      <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.8" cy="10.8" r="6.8" /><path d="m16 16 4 4" /></svg>
      <input value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} />
      {value && <button type="button" className="search-clear" onClick={() => onChange("")} aria-label="Xóa từ khóa"><X size={15} /></button>}
    </label>
  );
}

export function DataTable({ columns, rows, rowKey = "id", emptyMessage = "Chưa có dữ liệu." }) {
  return (
    <div className="table-scroll">
      <table className="data-table">
        <thead>
          <tr>{columns.map((column) => <th key={column.key} className={column.className || ""}>{column.label}</th>)}</tr>
        </thead>
        <tbody>
          {rows.length ? rows.map((row, index) => (
            <tr key={row[rowKey] ?? index}>
              {columns.map((column) => (
                <td key={column.key} className={column.className || ""}>
                  {column.render ? column.render(row) : row[column.key]}
                </td>
              ))}
            </tr>
          )) : (
            <tr><td className="table-empty" colSpan={columns.length}>{emptyMessage}</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

export function Modal({ open, title, description, onClose, children, size = "normal" }) {
  useEffect(() => {
    if (!open) return undefined;
    const handleKeyDown = (event) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className={`modal modal-${size}`} role="dialog" aria-modal="true" aria-labelledby="modal-title">
        <header className="modal-header">
          <div>
            <h2 id="modal-title">{title}</h2>
            {description && <p>{description}</p>}
          </div>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Đóng hộp thoại"><X size={18} /></button>
        </header>
        {children}
      </section>
    </div>
  );
}

export function EmptyState({ icon: Icon = BookOpen, title, description, action }) {
  return (
    <div className="empty-state">
      <span className="empty-state-icon"><Icon size={22} /></span>
      <h3>{title}</h3>
      <p>{description}</p>
      {action}
    </div>
  );
}

export function Toast({ toast, onClose }) {
  if (!toast) return null;
  return (
    <div className={`app-toast app-toast-${toast.type || "success"}`} role={toast.type === "error" ? "alert" : "status"}>
      <span>{toast.message}</span>
      <button type="button" className="icon-button" onClick={onClose} aria-label="Đóng thông báo"><X size={15} /></button>
    </div>
  );
}

export function formatCount(value) {
  return new Intl.NumberFormat("vi-VN").format(Number(value) || 0);
}
