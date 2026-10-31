"use client";

import { useId, useRef } from "react";
import { createPortal } from "react-dom";
import { useDialogA11y } from "@/lib/useDialogA11y";

type Props = {
  open: boolean;
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

export default function ConfirmDialog({ open, ...rest }: Props) {
  if (!open) return null;

  // Va directo al <body>: si no, queda atrapado debajo de la barra de navegación.
  return createPortal(<DialogContent {...rest} />, document.body);
}

// Se monta solo con el diálogo abierto, así el foco y el bloqueo de scroll
// empiezan y terminan junto con él.
function DialogContent({
  title,
  message,
  confirmLabel = "Eliminar",
  cancelLabel = "Cancelar",
  danger = true,
  onConfirm,
  onCancel,
}: Omit<Props, "open">) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const messageId = useId();
  useDialogA11y(dialogRef, onCancel);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 sm:items-center"
      onClick={onCancel}
    >
      <div
        ref={dialogRef}
        role={danger ? "alertdialog" : "dialog"}
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={message ? messageId : undefined}
        tabIndex={-1}
        className="w-full max-w-sm rounded-2xl bg-plum-deep p-5 shadow-2xl outline-none"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id={titleId} className="font-display text-lg text-mist">
          {title}
        </h2>
        {message && (
          <p id={messageId} className="mt-1.5 text-sm text-lilac-light">
            {message}
          </p>
        )}
        <div className="mt-5 flex gap-2">
          {/* El foco arranca en "Cancelar": un Enter apurado no borra nada. */}
          <button
            type="button"
            data-autofocus
            onClick={onCancel}
            className="flex-1 rounded-full bg-plum py-2.5 text-sm font-medium text-mist"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className={`flex-1 rounded-full py-2.5 text-sm font-semibold ${
              danger ? "bg-accent text-night" : "bg-plum text-mist"
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
