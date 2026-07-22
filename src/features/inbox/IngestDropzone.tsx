import { open } from '@tauri-apps/plugin-dialog';
import { useEffect, useState } from 'react';
import { getInboxItems, importFiles, type ImportFileResult } from '../../lib/tauri';

export function IngestDropzone() {
  const [items, setItems] = useState<ImportFileResult[]>([]);
  const [isSelecting, setIsSelecting] = useState(false);

  useEffect(() => {
    void getInboxItems()
      .then((storedItems) => setItems(storedItems.map((item) => ({ sourcePath: item.filename, item, error: null }))))
      .catch(() => undefined);
  }, []);

  const selectFiles = async () => {
    setIsSelecting(true);
    try {
      const selection = await open({
        multiple: true,
        filters: [{ name: '题目与资料', extensions: ['png', 'jpg', 'jpeg', 'webp', 'pdf'] }],
      });
      const paths = Array.isArray(selection) ? selection : selection ? [selection] : [];
      if (paths.length === 0) return;
      const results = await importFiles(paths);
      setItems((current) => [...results, ...current]);
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
        {isSelecting ? '正在选择…' : '投进题目'}
      </button>
      <div aria-live="polite" className="inbox-results">
        {items.length === 0 ? <p className="inbox-empty">还没有待整理的题目。</p> : null}
        {items.map((result) => (
          <article className="inbox-result" key={`${result.sourcePath}-${result.item?.id ?? result.error}`}>
            <span className="file-mark" aria-hidden="true">⌁</span>
            <div>
              <strong>{result.item?.filename ?? result.sourcePath.split(/[\\/]/).at(-1)}</strong>
              <p className={result.error ? 'import-error' : 'import-success'}>{result.error ?? '已安全保存'}</p>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
