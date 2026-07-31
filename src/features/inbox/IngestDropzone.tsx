import { FileText, Upload } from 'lucide-react';
import { useEffect, useState } from 'react';
import { getInboxItems, type ImportFileResult } from '../../lib/tauri';
import { selectProblemFiles } from './selectProblemFiles';

export function IngestDropzone({
  courseId,
  onImported,
  onOpenProblem,
}: {
  courseId: string | null;
  onImported?: () => void;
  onOpenProblem?: (problemId: string) => void;
}) {
  const [items, setItems] = useState<ImportFileResult[]>([]);
  const [isSelecting, setIsSelecting] = useState(false);
  const [selectionError, setSelectionError] = useState<string | null>(null);

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
      if (results.some((result) => result.item)) onImported?.();
    } catch {
      setSelectionError('导入没有完成。请稍后重试。之前的题目仍然安全保留。');
    } finally {
      setIsSelecting(false);
    }
  };

  return (
    <section aria-label="收件箱投题" className="inbox-capture">
      <div className="inbox-capture-copy">
        <p className="eyebrow">收件箱</p>
        <h2>把题目先放进来。</h2>
        <p>题图和 PDF 会先安全保存到本地，再慢慢补题干、答案和解析。</p>
      </div>
      <button className="primary-action" disabled={isSelecting} onClick={() => void selectFiles()} type="button">
        <Upload aria-hidden="true" size={15} strokeWidth={2.3} />{isSelecting ? '正在选择…' : '投进题目'}
      </button>
      {selectionError ? <p className="import-error inbox-import-error" role="alert">{selectionError}</p> : null}
      <div aria-live="polite" className="inbox-results">
        {items.length === 0 ? <p className="inbox-empty">还没有待整理的题目。</p> : null}
        {items.map((result) => (
          <article className="inbox-result" key={`${result.sourcePath}-${result.item?.id ?? result.error}`}>
            {result.item ? (
              <button className="inbox-result-button" onClick={() => onOpenProblem?.(result.item!.problemId)} type="button">
                <span className="file-mark" aria-hidden="true"><FileText size={16} strokeWidth={1.8} /></span>
                <span>
                  <strong>{result.item.filename}</strong>
                  <span className="import-success">已安全保存</span>
                </span>
              </button>
            ) : (
              <>
                <span className="file-mark" aria-hidden="true"><FileText size={16} strokeWidth={1.8} /></span>
                <div>
                  <strong>{result.sourcePath.split(/[\\/]/).at(-1)}</strong>
                  <p className="import-error">{result.error}</p>
                </div>
              </>
            )}
          </article>
        ))}
      </div>
    </section>
  );
}
