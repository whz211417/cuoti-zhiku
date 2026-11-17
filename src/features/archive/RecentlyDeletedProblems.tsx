import { FileText, RotateCcw } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { listTrashedProblems, restoreProblem, type TrashedProblem } from '../../lib/tauri';

const dateFormat = new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium' });

export function RecentlyDeletedProblems({ onRestored }: { onRestored: () => void }) {
  const [items, setItems] = useState<TrashedProblem[] | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ text: string; failed: boolean } | null>(null);
  const requestRef = useRef(0);
  const restoringRef = useRef(false);

  const load = useCallback(async () => {
    const request = ++requestRef.current;
    setLoadFailed(false);
    try {
      const next = await listTrashedProblems();
      if (requestRef.current === request) setItems(next);
    } catch {
      if (requestRef.current === request) setLoadFailed(true);
    }
  }, []);

  useEffect(() => {
    void load();
    return () => { requestRef.current += 1; };
  }, [load]);

  const restore = async (item: TrashedProblem) => {
    if (restoringRef.current) return;
    restoringRef.current = true;
    setRestoringId(item.id);
    setNotice(null);
    try {
      await restoreProblem(item.id);
      setItems((current) => current?.filter(({ id }) => id !== item.id) ?? null);
      setNotice({ text: `已恢复「${item.title}」。`, failed: false });
      onRestored();
    } catch {
      setNotice({ text: '题目没有恢复，请重试。', failed: true });
    } finally {
      restoringRef.current = false;
      setRestoringId(null);
    }
  };

  if (loadFailed) return <div className="archive-error" role="alert">
    <span>暂时无法读取最近删除的题目。</span>
    <button onClick={() => void load()} type="button">重新读取</button>
  </div>;
  if (!items) return <p className="archive-state" role="status">正在读取最近删除…</p>;

  return (
    <div className="recently-deleted-problems">
      {notice ? <p className="archive-state" role={notice.failed ? 'alert' : 'status'}>{notice.text}</p> : null}
      {items.length === 0 ? <p className="archive-state">还没有最近删除的题目。</p> : (
        <>
          <p className="archive-state">恢复后，题目会回到原来的整理状态和复习计划。</p>
          <ul className="problem-trash-list">
            {items.map((item) => {
              const deletedAt = new Date(item.deletedAt);
              return (
                <li key={item.id}>
                  <FileText aria-hidden="true" size={16} />
                  <div>
                    <strong>{item.title}</strong>
                    <small>{item.courseName}{Number.isFinite(deletedAt.valueOf()) ? ` · ${dateFormat.format(deletedAt)}移入` : ''}</small>
                  </div>
                  <button aria-label={`恢复 ${item.title}`} disabled={restoringId !== null} onClick={() => void restore(item)} type="button">
                    <RotateCcw aria-hidden="true" size={14} />{restoringId === item.id ? '恢复中…' : '恢复'}
                  </button>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
}
