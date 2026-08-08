import { open } from '@tauri-apps/plugin-dialog';
import { Boxes, ExternalLink, FolderOutput } from 'lucide-react';
import { useState } from 'react';
import { localCalendarDate } from '../../lib/dates';
import { exportObsidianVault, openObsidianCanvas, type ObsidianExportReport } from '../../lib/tauri';

export function ObsidianSettings({ courseId }: { courseId: string | null }) {
  const [scope, setScope] = useState<'current' | 'all'>(courseId ? 'current' : 'all');
  const [exporting, setExporting] = useState(false);
  const [opening, setOpening] = useState(false);
  const [report, setReport] = useState<ObsidianExportReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  const startExport = async () => {
    setError(null);
    const selected = await open({ directory: true, multiple: false, title: '选择 Obsidian Vault' });
    const destination = Array.isArray(selected) ? selected[0] : selected;
    if (!destination) return;
    setExporting(true);
    try {
      setReport(await exportObsidianVault(destination, scope === 'current' ? courseId : null, localCalendarDate()));
    } catch (reason) {
      setError(typeof reason === 'string' ? reason : '导出没有完成。原有 Vault 文件没有被删除。');
    } finally {
      setExporting(false);
    }
  };

  const openCanvas = async () => {
    if (!report?.courseCanvasPath) return;
    setOpening(true);
    setError(null);
    try {
      await openObsidianCanvas(report.courseCanvasPath);
    } catch (reason) {
      setError(typeof reason === 'string' ? reason : '没有找到 Obsidian。导出文件仍保存在 Vault 中。');
    } finally {
      setOpening(false);
    }
  };

  return (
    <div className="obsidian-settings">
      <div className="obsidian-settings-copy">
        <span className="obsidian-mark"><Boxes aria-hidden="true" size={17} /></span>
        <div>
          <strong>导出到 Obsidian</strong>
          <p>单向导出 Markdown、附件和 Canvas。不会读取或覆盖你在 Obsidian 中修改过的内容。</p>
        </div>
      </div>
      {courseId ? (
        <div aria-label="Obsidian 导出范围" className="obsidian-scope" role="group">
          <button aria-pressed={scope === 'current'} onClick={() => setScope('current')} type="button">当前课程</button>
          <button aria-pressed={scope === 'all'} onClick={() => setScope('all')} type="button">全部课程</button>
        </div>
      ) : null}
      <div className="obsidian-actions">
        <button disabled={exporting || opening} onClick={() => void startExport()} type="button"><FolderOutput aria-hidden="true" size={15} />{exporting ? '正在导出…' : '选择 Vault 并导出'}</button>
        {report?.courseCanvasPath ? <button disabled={opening || exporting} onClick={() => void openCanvas()} type="button"><ExternalLink aria-hidden="true" size={15} />{opening ? '正在打开…' : '在 Obsidian 打开'}</button> : null}
      </div>
      {report ? (
        <p aria-live="polite" className={`obsidian-report${report.conflicts ? ' has-conflicts' : ''}`}>
          已写入 {report.written} 个文件，{report.unchanged} 个未变化{report.conflicts ? `，保留了 ${report.conflicts} 个冲突副本` : ''}。
        </p>
      ) : null}
      {error ? <p className="obsidian-error" role="alert">{error}</p> : null}
    </div>
  );
}
