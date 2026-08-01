import { AlertCircle, Archive, FileText, RefreshCw } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { readableLocalUpdate } from '../../lib/dates';
import { getAllProblems, type RecentProblem } from '../../lib/tauri';
import { MaterialsLibrary } from '../materials/MaterialsLibrary';

type ArchiveLibraryProps = {
  courseId: string | null;
  initialQuery?: string;
  onOpenProblem: (id: string) => void;
  onSaved?: () => void;
};

export function ArchiveLibrary({
  courseId,
  initialQuery = '',
  onOpenProblem,
  onSaved,
}: ArchiveLibraryProps) {
  const [problems, setProblems] = useState<RecentProblem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const activeRequest = useRef(0);

  const load = useCallback(async () => {
    const request = activeRequest.current + 1;
    activeRequest.current = request;
    setIsLoading(true);
    setHasError(false);
    try {
      const nextProblems = await getAllProblems();
      if (activeRequest.current === request) setProblems(nextProblems);
    } catch {
      if (activeRequest.current === request) setHasError(true);
    } finally {
      if (activeRequest.current === request) setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    return () => {
      activeRequest.current += 1;
    };
  }, [load]);

  return (
    <div className="archive-library">
      <section aria-labelledby="problem-archive-title" className="problem-archive">
        <header className="archive-heading">
          <div>
            <p className="eyebrow">完整题目索引</p>
            <h2 id="problem-archive-title">题目档案</h2>
          </div>
          <span><Archive aria-hidden="true" size={16} />{problems.length} 道题</span>
        </header>

        {isLoading && problems.length === 0 ? (
          <p className="archive-state" role="status">正在读取题目档案…</p>
        ) : null}
        {hasError ? (
          <div className="archive-error" role="alert">
            <AlertCircle aria-hidden="true" size={18} />
            <span>题目档案暂时无法读取。</span>
            <button onClick={() => void load()} type="button"><RefreshCw aria-hidden="true" size={14} />重新读取题目档案</button>
          </div>
        ) : null}
        {!isLoading && !hasError && problems.length === 0 ? (
          <div className="archive-empty">
            <Archive aria-hidden="true" size={22} />
            <h3>还没有题目档案</h3>
            <p>从待整理导入一道题后，它会出现在这里。</p>
          </div>
        ) : null}
        {problems.length > 0 ? (
          <ul className="problem-archive-list">
            {problems.map((problem) => (
              <li key={problem.id}>
                <button aria-label={`打开 ${problem.title}`} onClick={() => onOpenProblem(problem.id)} type="button">
                  <FileText aria-hidden="true" size={16} />
                  <span>
                    <strong>{problem.title}</strong>
                    <small>{problem.courseName || '未归类课程'} · {readableLocalUpdate(problem.updatedAt)}</small>
                  </span>
                  <em>{problem.status === 'inbox' ? '待整理' : '已归档'}</em>
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </section>

      <MaterialsLibrary courseId={courseId} initialQuery={initialQuery} onSaved={onSaved} />
    </div>
  );
}
