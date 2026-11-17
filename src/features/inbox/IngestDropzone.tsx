import { FileText, Trash2, Upload } from 'lucide-react';
import { useEffect, useState } from 'react';
import { RemovalDialog } from '../../components/actions/RemovalDialog';
import { RowActionMenu } from '../../components/actions/RowActionMenu';
import { getInboxItems, trashProblem, type ImportFileResult, type InboxItem } from '../../lib/tauri';
import { selectProblemFiles } from './selectProblemFiles';

export function IngestDropzone({
  courseId,
  onImported,
  onOpenProblem,
  onProblemTrashed,
}: {
  courseId: string | null;
  onImported?: (problemIds: string[]) => void;
  onOpenProblem?: (problemId: string) => void;
  onProblemTrashed?: (problemId: string) => void;
}) {
  const [items, setItems] = useState<ImportFileResult[]>([]);
  const [isSelecting, setIsSelecting] = useState(false);
  const [selectionError, setSelectionError] = useState<string | null>(null);
  const [pendingRemoval, setPendingRemoval] = useState<InboxItem | null>(null);
  const [removalNotice, setRemovalNotice] = useState(false);

  useEffect(() => {
    void getInboxItems()
      .then((storedItems) => setItems(storedItems.map((item) => ({ sourcePath: item.filename, item, error: null }))))
      .catch(() => undefined);
  }, []);

  const selectFiles = async () => {
    setIsSelecting(true);
    setSelectionError(null);
    try {
      const results = await selectProblemFiles(courseId);
      if (results.length === 0) return;
      setItems((current) => [...results, ...current]);
      const problemIds = results.flatMap((result) => result.item ? [result.item.problemId] : []);
      if (problemIds.length > 0) {
        onImported?.(problemIds);
        onOpenProblem?.(problemIds[0]);
      }
    } catch {
      setSelectionError('导入没有完成。请稍后重试。之前的题目仍然安全保留。');
    } finally {
      setIsSelecting(false);
    }
  };

  const moveToTrash = async (item: InboxItem) => {
    await trashProblem(item.problemId);
    setItems((current) => current.filter((result) => result.item?.problemId !== item.problemId));
    setRemovalNotice(true);
    onProblemTrashed?.(item.problemId);
  };

  return (
    <section aria-label="待整理投题" className="inbox-capture">
      <div className="inbox-capture-copy">
        <p className="eyebrow">待整理</p>
        <h2>把题目先放进来。</h2>
        <p>题图和 PDF 会先安全保存到本地，再慢慢补题干、答案和解析。</p>
      </div>
      <button className="primary-action" disabled={isSelecting} onClick={() => void selectFiles()} type="button">
        <Upload aria-hidden="true" size={15} strokeWidth={2.3} />{isSelecting ? '正在选择…' : '投进题目'}
      </button>
      {selectionError ? <p className="import-error inbox-import-error" role="alert">{selectionError}</p> : null}
      {removalNotice ? <p className="archive-state" role="status">已移入最近删除。可在「全部档案 → 最近删除」恢复。</p> : null}
      <div aria-live="polite" className="inbox-results">
        {items.length === 0 ? <p className="inbox-empty">还没有待整理的题目。</p> : null}
        {items.map(({ item, sourcePath, error }) => item ? (
          <RowActionMenu actions={[
            { label: '打开题目', icon: FileText, run: () => onOpenProblem?.(item.problemId) },
            { label: '移入最近删除…', icon: Trash2, destructive: true, run: () => setPendingRemoval(item) },
          ]} as="article" className="inbox-result" key={item.id} label={item.filename}>
            <button className="inbox-result-button" onClick={() => onOpenProblem?.(item.problemId)} type="button">
              <span className="file-mark" aria-hidden="true"><FileText size={16} strokeWidth={1.8} /></span>
              <span>
                <strong>{item.filename}</strong>
                <span className="import-success">已安全保存</span>
              </span>
            </button>
          </RowActionMenu>
        ) : (
          <article className="inbox-result" key={sourcePath}>
            <span className="file-mark" aria-hidden="true"><FileText size={16} strokeWidth={1.8} /></span>
            <div>
              <strong>{sourcePath.split(/[\\/]/).at(-1)}</strong>
              <p className="import-error">{error}</p>
            </div>
          </article>
        ))}
      </div>
      {pendingRemoval ? <RemovalDialog
        confirmLabel="移入最近删除"
        description="可在「全部档案 → 最近删除」恢复这道题。已录入的内容和保存的附件会保留。"
        failureMessage="题目没有移入最近删除，请重试。"
        heading={`将「${pendingRemoval.filename}」移入最近删除？`}
        onClose={() => setPendingRemoval(null)}
        onConfirm={() => moveToTrash(pendingRemoval)}
      /> : null}
    </section>
  );
}
