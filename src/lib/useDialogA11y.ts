"use client";

import { useEffect, useRef, type RefObject } from "react";

// Accesibilidad de un diálogo modal: foco inicial, foco atrapado con Tab,
// cierre con Escape, scroll de fondo bloqueado y foco devuelto al cerrar.
// Se usa en el componente que se monta SOLO mientras el diálogo está abierto.

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

// Pila de diálogos abiertos: Escape y Tab solo le tocan al de arriba.
const stack: HTMLElement[] = [];

// Bloqueo de scroll compartido: con dos diálogos a la vez se libera recién al cerrar el último.
let scrollLocks = 0;
let previousOverflow = "";

function lockScroll() {
  if (scrollLocks === 0) {
    previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
  }
  scrollLocks++;
}

function unlockScroll() {
  scrollLocks = Math.max(0, scrollLocks - 1);
  if (scrollLocks === 0) document.body.style.overflow = previousOverflow;
}

function focusableIn(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    (el) => !el.hasAttribute("disabled") && el.getAttribute("aria-hidden") !== "true"
  );
}

/**
 * `containerRef` es el contenedor del diálogo (con tabIndex={-1}). Si algún
 * elemento tiene `data-autofocus`, ese recibe el foco inicial; si no, el primero.
 */
export function useDialogA11y(containerRef: RefObject<HTMLElement | null>, onClose: () => void) {
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const previouslyFocused = document.activeElement as HTMLElement | null;
    stack.push(container);
    lockScroll();

    const initial =
      container.querySelector<HTMLElement>("[data-autofocus]") ?? focusableIn(container)[0] ?? container;
    initial.focus();

    function onKeyDown(e: KeyboardEvent) {
      if (!container || stack[stack.length - 1] !== container) return;
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        onCloseRef.current();
        return;
      }
      if (e.key !== "Tab") return;
      const items = focusableIn(container);
      if (items.length === 0) {
        e.preventDefault();
        container.focus();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && (active === first || !container.contains(active))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (active === last || !container.contains(active))) {
        e.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("keydown", onKeyDown, true);
      const i = stack.lastIndexOf(container);
      if (i >= 0) stack.splice(i, 1);
      unlockScroll();
      if (previouslyFocused && document.contains(previouslyFocused)) previouslyFocused.focus();
    };
  }, [containerRef]);
}
