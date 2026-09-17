import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

export function Modal({
  title,
  action,
  onClose,
  children,
}: {
  title: string;
  action?: ReactNode;
  onClose: () => void;
  children: ReactNode;
}) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section className="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title">
        <div className="modal-heading">
          <h2 id="modal-title">{title}</h2>
          {action}
          <button className="modal-close" type="button" onClick={onClose} aria-label="Cerrar">
            x
          </button>
        </div>
        {children}
      </section>
    </div>
  );
}

export function TopAlert({ message, error = false }: { message: string; error?: boolean }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!message) {
      setVisible(false);
      return;
    }
    setVisible(true);
    const timeout = window.setTimeout(() => setVisible(false), 5000);
    return () => window.clearTimeout(timeout);
  }, [message, error]);

  if (!message || !visible) return null;
  return createPortal(
    <div className={`top-alert${error ? " top-alert-error" : ""}`} role={error ? "alert" : "status"}>
      {message}
    </div>,
    document.body,
  );
}
