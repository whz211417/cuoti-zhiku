import { Check, FileWarning, LoaderCircle } from 'lucide-react';
import type { ImportFileResult } from '../../lib/tauri';

export function ImportProgress({
  phase,
  results,
}: {
  phase: 'importing' | 'complete';
  results: ImportFileResult[];
}) {
  if (phase === 'importing') {
    return <p aria-live="polite" className="global-file-drop__progress"><LoaderCircle aria-hidden="true" size={16} />正在安全保存原件…</p>;
  }

  const saved = results.filter((result) => result.item).length;
  const failed = results.length - saved;
  return (
    <div aria-live="polite" className="global-file-drop__result">
      <p className={saved > 0 ? 'global-file-drop__saved' : 'global-file-drop__failed'}>
        {saved > 0 ? <Check aria-hidden="true" size={16} /> : <FileWarning aria-hidden="true" size={16} />}
        {saved > 0 ? `已保存 ${saved} 个${failed > 0 ? `，${failed} 个未导入` : ''}` : `未能导入 ${failed} 个文件`}
      </p>
      {failed > 0 ? <p className="global-file-drop__detail">未导入的文件不会影响已经保存的原件。</p> : null}
    </div>
  );
}
