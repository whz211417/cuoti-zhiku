import { FilePlus2, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { type ImportFileResult, importFiles } from '../../lib/tauri';
import { SUPPORTED_PROBLEM_EXTENSIONS } from '../inbox/selectProblemFiles';
import { ImportProgress } from './ImportProgress';
import { subscribeToWindowFileDrop, type WindowFileDrop } from './windowFileDrop';

type Phase = 'idle' | 'ready' | 'importing' | 'complete';

const supportedTypes = SUPPORTED_PROBLEM_EXTENSIONS
  .map((extension) => extension === 'markdown' ? 'Markdown' : extension.toUpperCase())
  .join('、');

export function GlobalFileDrop({
  courseId,
  onImported,
  onOpenInbox,
}: {
  courseId: string | null;
  onImported: () => void;
  onOpenInbox: () => void;
}) {
  const [phase, setPhase] = useState<Phase>('idle');
  const [paths, setPaths] = useState<string[]>([]);
  const [results, setResults] = useState<ImportFileResult[]>([]);
  const importingRef = useRef(false);
  const courseIdRef = useRef(courseId);

  useEffect(() => {
    courseIdRef.current = courseId;
  }, [courseId]);

  useEffect(() => {
    let active = true;
    let stop: (() => void) | undefined;
    const handleWindowDrop = (event: WindowFileDrop) => {
      if (!active) return;
      if (event.type === 'enter') {
        if (!importingRef.current) {
          setPaths(event.paths);
          setPhase('ready');
        }
        return;
      }
      if (event.type === 'over') {
        if (!importingRef.current) setPhase('ready');
        return;
      }
      if (event.type === 'leave') {
        if (!importingRef.current) setPhase('idle');
        return;
      }
      if (importingRef.current || event.paths.length === 0) return;

      importingRef.current = true;
      const capturedCourseId = courseIdRef.current;
      setPaths(event.paths);
      setResults([]);
      setPhase('importing');
      void importFiles(event.paths, capturedCourseId ?? undefined)
        .then((nextResults) => {
          if (!active) return;
          setResults(nextResults);
          setPhase('complete');
          if (nextResults.some((result) => result.item)) onImported();
        })
        .catch(() => {
          if (!active) return;
          setResults(event.paths.map((sourcePath) => ({ sourcePath, item: null, error: '导入没有完成，请稍后重试。' })));
          setPhase('complete');
        })
        .finally(() => {
          importingRef.current = false;
        });
    };

    void subscribeToWindowFileDrop(handleWindowDrop)
      .then((unlisten) => {
        if (active) stop = unlisten;
        else unlisten();
      })
      .catch(() => undefined);
    return () => {
      active = false;
      stop?.();
    };
  }, [onImported]);

  const dismiss = () => {
    if (phase === 'importing') return;
    setResults([]);
    setPaths([]);
    setPhase('idle');
  };

  const openInbox = () => {
    dismiss();
    onOpenInbox();
  };

  const visible = phase !== 'idle';
  return (
    <aside aria-hidden={!visible} aria-label="拖放文件导入" className={`global-file-drop${visible ? ' is-visible' : ''}${phase === 'complete' ? ' is-complete' : ''}`}>
      <section className="global-file-drop__surface">
        {phase === 'ready' ? (
          <>
            <span aria-hidden="true" className="global-file-drop__icon"><FilePlus2 size={24} strokeWidth={1.8} /></span>
            <p className="eyebrow">本地待整理</p>
            <h2>松手即可保存到待整理</h2>
            <p>原件会先安全保存在这台电脑，再由你决定是否整理。</p>
            <small>支持 {supportedTypes}</small>
          </>
        ) : phase === 'importing' || phase === 'complete' ? (
          <>
            <p className="eyebrow">本地收件箱</p>
            <h2>{phase === 'importing' ? '正在保存原件' : '导入结果'}</h2>
            <ImportProgress phase={phase} results={results} />
            {phase === 'complete' ? (
              <div className="global-file-drop__actions">
                <button className="global-file-drop__open" onClick={openInbox} type="button">查看待整理</button>
                <button aria-label="关闭导入结果" className="global-file-drop__dismiss" onClick={dismiss} type="button"><X aria-hidden="true" size={16} /></button>
              </div>
            ) : null}
          </>
        ) : null}
        {phase === 'ready' ? <p className="global-file-drop__file-count">{paths.length > 0 ? `准备导入 ${paths.length} 个文件` : '准备导入文件'}</p> : null}
      </section>
    </aside>
  );
}
