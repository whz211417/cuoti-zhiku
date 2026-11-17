import { Trash2 } from 'lucide-react';
import { useId, useLayoutEffect, useRef, useState } from 'react';

export function RemovalDialog({
  confirmLabel,
  description,
  failureMessage,
  heading,
  onClose,
  onConfirm,
}: {
  confirmLabel: string;
  description: string;
  failureMessage: string;
  heading: string;
  onClose: () => void;
  onConfirm: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const inFlight = useRef(false);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const descriptionId = useId();

  useLayoutEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const trigger = document.activeElement;
    if (typeof dialog.showModal === 'function') dialog.showModal();
    else dialog.setAttribute('open', '');
    cancelRef.current?.focus();
    return () => {
      if (typeof dialog.close === 'function') dialog.close();
      else dialog.removeAttribute('open');
      if (trigger instanceof HTMLElement && trigger.isConnected) trigger.focus({ preventScroll: true });
    };
  }, []);

  const confirm = async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError(false);
    try {
      await onConfirm();
      onClose();
    } catch {
      setError(true);
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };

  return (
    <dialog aria-busy={busy} aria-describedby={descriptionId} aria-label={confirmLabel} className="removal-dialog" onCancel={(event) => {
      event.preventDefault();
      if (!inFlight.current) onClose();
    }} ref={dialogRef}>
      <span className="removal-dialog-mark"><Trash2 aria-hidden="true" size={20} /></span>
      <h2>{heading}</h2>
      <p id={descriptionId}>{description}</p>
      {error ? <p className="removal-dialog-error" role="alert">{failureMessage}</p> : null}
      <div className="removal-dialog-actions">
        <button disabled={busy} onClick={onClose} ref={cancelRef} type="button">取消</button>
        <button className="removal-confirm" disabled={busy} onClick={() => void confirm()} type="button">
          {busy ? '正在处理…' : confirmLabel}
        </button>
      </div>
    </dialog>
  );
}
