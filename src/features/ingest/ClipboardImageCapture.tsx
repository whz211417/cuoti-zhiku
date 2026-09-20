import { CheckCircle2, ImagePlus, LoaderCircle, XCircle } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { importClipboardImage } from '../../lib/tauri';

type CaptureState = 'idle' | 'saving' | 'saved' | 'failed';
const supportedImageTypes = new Set(['image/png', 'image/jpeg', 'image/webp']);

function isEditableTarget(target: EventTarget | null) {
  return target instanceof HTMLElement
    && (target.isContentEditable || target.matches('input, textarea, select, [role="textbox"]'));
}

function readAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('read failed'));
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : '';
      const separator = result.indexOf(',');
      if (separator < 0) reject(new Error('invalid data url'));
      else resolve(result.slice(separator + 1));
    };
    reader.readAsDataURL(file);
  });
}

export function ClipboardImageCapture({ courseId, onImported, onOpenInbox }: {
  courseId: string | null;
  onImported: (problemIds: string[]) => void;
  onOpenInbox: () => void;
}) {
  const [state, setState] = useState<CaptureState>('idle');
  const [message, setMessage] = useState('');
  const courseIdRef = useRef(courseId);
  const requestRef = useRef(0);

  useEffect(() => { courseIdRef.current = courseId; }, [courseId]);

  useEffect(() => {
    const handlePaste = (event: ClipboardEvent) => {
      if (isEditableTarget(event.target) || state === 'saving') return;
      const item = Array.from(event.clipboardData?.items ?? [])
        .find((candidate) => candidate.kind === 'file' && supportedImageTypes.has(candidate.type));
      const file = item?.getAsFile();
      if (!file) return;
      event.preventDefault();
      const request = requestRef.current + 1;
      requestRef.current = request;
      setState('saving');
      setMessage('正在把剪贴板截图安全保存到待整理…');
      void readAsBase64(file)
        .then((dataBase64) => importClipboardImage(dataBase64, file.type, courseIdRef.current ?? undefined))
        .then((item) => {
          if (requestRef.current !== request) return;
          setState('saved');
          setMessage('截图已保存到待整理');
          onImported([item.problemId]);
        })
        .catch(() => {
          if (requestRef.current !== request) return;
          setState('failed');
          setMessage('截图没有保存，请重试或直接拖入图片');
        });
    };
    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, [onImported, state]);

  useEffect(() => {
    if (state !== 'saved') return;
    const timer = window.setTimeout(() => setState('idle'), 4500);
    return () => window.clearTimeout(timer);
  }, [state]);

  if (state === 'idle') return null;
  const Icon = state === 'saving' ? LoaderCircle : state === 'saved' ? CheckCircle2 : XCircle;
  return (
    <aside aria-live="polite" className={`clipboard-capture-toast is-${state}`} role="status">
      <Icon aria-hidden="true" className={state === 'saving' ? 'is-spinning' : undefined} size={19} />
      <span><strong>{message}</strong><small>{state === 'saved' ? '原件已按内容指纹保存，可稍后整理' : '支持 PNG、JPEG 与 WebP'}</small></span>
      {state === 'saved' ? <button onClick={onOpenInbox} type="button"><ImagePlus aria-hidden="true" size={15} />查看</button> : null}
    </aside>
  );
}
