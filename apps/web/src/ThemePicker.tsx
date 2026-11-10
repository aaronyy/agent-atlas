import { useEffect, useId, useRef, useState } from "react";
import { THEME_OPTIONS, useTheme, type ThemeId } from "./theme";

function PaletteIcon() {
  return (
    <svg
      className="theme-palette-icon"
      viewBox="0 0 24 24"
      width="16"
      height="16"
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 3c-4.7 0-8.5 3.5-8.5 7.9 0 3.4 2.4 6.2 5.7 7.1.5.1 1-.3.9-.9l-.2-.8c-.2-.8.4-1.5 1.2-1.5h1.7c3.8 0 6.9-2.8 6.9-6.3C19.7 5.9 16.4 3 12 3Z" />
      <circle cx="8.4" cy="9.6" r="0.9" fill="currentColor" stroke="none" />
      <circle cx="11.4" cy="7.6" r="0.9" fill="currentColor" stroke="none" />
      <circle cx="14.8" cy="8" r="0.9" fill="currentColor" stroke="none" />
      <circle cx="16.4" cy="11" r="0.9" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function ThemePicker() {
  const { theme, setTheme } = useTheme();
  const [open, setOpen] = useState(false);
  const titleId = useId();
  const closeRef = useRef<HTMLButtonElement>(null);
  const currentLabel =
    THEME_OPTIONS.find((o) => o.id === theme)?.label ?? "Theme";

  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open]);

  function choose(id: ThemeId) {
    setTheme(id);
    setOpen(false);
  }

  return (
    <>
      <button
        className="theme-icon-btn"
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={`Theme · ${currentLabel}`}
        title={`Theme · ${currentLabel}`}
      >
        <PaletteIcon />
      </button>

      {open && (
        <div
          className="theme-modal-backdrop"
          onClick={() => setOpen(false)}
          role="presentation"
        >
          <div
            className="theme-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="theme-modal-header">
              <h2 id={titleId}>Theme</h2>
              <button
                ref={closeRef}
                className="btn ghost"
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close"
              >
                Close
              </button>
            </div>
            <div className="theme-modal-options" role="listbox" aria-label="Themes">
              {THEME_OPTIONS.map((opt) => {
                const selected = opt.id === theme;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    role="option"
                    aria-selected={selected}
                    className={`theme-option${selected ? " selected" : ""}`}
                    onClick={() => choose(opt.id)}
                  >
                    <span className={`theme-swatch theme-swatch-${opt.id}`} />
                    <span className="theme-option-label">{opt.label}</span>
                    {selected ? (
                      <span className="theme-option-check">Selected</span>
                    ) : null}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
