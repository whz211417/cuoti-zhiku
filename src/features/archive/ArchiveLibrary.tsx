import { AlertCircle, Archive, ChevronLeft, Download, FileText, RefreshCw, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { RemovalDialog } from '../../components/actions/RemovalDialog';
import { RowActionMenu } from '../../components/actions/RowActionMenu';
import { readableLocalUpdate } from '../../lib/dates';
import { getAllProblems, trashProblem, type RecentProblem } from '../../lib/tauri';
import { MaterialsLibrary } from '../materials/MaterialsLibrary';
import { RecentlyDeletedProblems } from './RecentlyDeletedProblems';

type ArchiveLibraryProps = {
  courseId: string | null;
  initialQuery?: string;
  onExport?: () => void;
  onOpenProblem: (id: string) => void;
  onProblemTrashed?: (id: string) => void;
  onSaved?: () => void;
};

export function ArchiveLibrary({
  courseId,
  initialQuery = '',
  onExport,
  onOpenProblem,
  onProblemTrashed,
  onSaved,
}: ArchiveLibraryProps) {
  const [problems, setProblems] = useState<RecentProblem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const [showTrash, setShowTrash] = useState(false);
  const [pendingRemoval, setPendingRemoval] = useState<RecentProblem | null>(null);
  const [removalNotice, setRemovalNotice] = useState<string | null>(null);
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

  const moveToTrash = async (problem: RecentProblem) => {
    await trashProblem(problem.id);
    setProblems((current) => current.filter(({ id }) => id !== problem.id));
    setRemovalNotice(`已将「${problem.title}」移入最近删除。`);
    void load();
    onProblemTrashed?.(problem.id);
  };

  return (
    <div className="archive-library">
      <section aria-labelledby="problem-archive-title" className="problem-archive">
        <header className="archive-heading">
          <div>
            <p className="eyebrow">{showTrash ? '题目档案' : '完整题目索引'}</p>
            <h2 id="problem-archive-title">{showTrash ? '最近删除' : '题目档案'}</h2>
          </div>
          <div className="archive-heading-actions">
            {!showTrash ? <span><Archive aria-hidden="true" size={16} />{problems.length} 道题</span> : null}
            {!showTrash && onExport ? <button aria-label="导出题册" onClick={onExport} type="button"><Download aria-hidden="true" size={14} />导出题册</button> : null}
            <button className="archive-trash-action" onClick={() => { setRemovalNotice(null); setShowTrash(!showTrash); }} type="button">
              {showTrash ? <><ChevronLeft aria-hidden="true" size={15} />返回题目档案</> : <><Trash2 aria-hidden="true" size={14} />最近删除</>}
            </button>
          </div>
        </header>

        {showTrash ? (
          <RecentlyDeletedProblems onRestored={() => { void load(); onSaved?.(); }} />
        ) : (
          <>
            {removalNotice ? <p className="archive-state" role="status">{removalNotice}</p> : null}
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
                  <RowActionMenu actions={[
                    { label: '打开题目', icon: FileText, run: () => onOpenProblem(problem.id) },
                    { label: '移入最近删除…', icon: Trash2, destructive: true, run: () => setPendingRemoval(problem) },
                  ]} key={problem.id} label={problem.title}>
                    <button aria-label={`打开 ${problem.title}`} className="problem-row-open" onClick={() => onOpenProblem(problem.id)} type="button">
                      <FileText aria-hidden="true" size={16} />
                      <span>
                        <strong>{problem.title}</strong>
                        <small>{problem.courseName || '未归类课程'} · {readableLocalUpdate(problem.updatedAt)}</small>
                      </span>
                      <em>{problem.status === 'inbox' ? '待整理' : '已归档'}</em>
                    </button>
                  </RowActionMenu>
                ))}
              </ul>
            ) : null}
          </>
        )}
        {pendingRemoval ? <RemovalDialog
          confirmLabel="移入最近删除"
          description="题目将从搜索、复习和导出中移出。可在「全部档案 → 最近删除」恢复题目、原件和复习进度。"
          failureMessage="题目没有移入最近删除，请重试。"
          heading={`将「${pendingRemoval.title}」移入最近删除？`}
          onClose={() => setPendingRemoval(null)}
          onConfirm={() => moveToTrash(pendingRemoval)}
        /> : null}
      </section>

      <MaterialsLibrary courseId={courseId} initialQuery={initialQuery} onSaved={onSaved} />
    </div>
  );
}
