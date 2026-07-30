import { KeyRound, ShieldCheck } from 'lucide-react';
import { useEffect, useState } from 'react';
import { clearAiApiKey, hasAiApiKey, saveAiApiKey } from '../../lib/tauri';

export function AiSettings() {
  const [apiKey, setApiKey] = useState('');
  const [hasKey, setHasKey] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    void hasAiApiKey().then(setHasKey).catch(() => setHasKey(false));
  }, []);

  const save = async () => {
    if (!apiKey.trim()) return;
    setIsSaving(true);
    setStatus(null);
    try {
      await saveAiApiKey(apiKey.trim());
      setApiKey('');
      setHasKey(true);
      setStatus('已保存到 Windows 凭据管理器。');
    } catch {
      setStatus('保存没有完成，请确认系统凭据管理器可用。');
    } finally {
      setIsSaving(false);
    }
  };

  const clear = async () => {
    setIsSaving(true);
    setStatus(null);
    try {
      await clearAiApiKey();
      setHasKey(false);
      setStatus('已从 Windows 凭据管理器移除。');
    } catch {
      setStatus('移除没有完成，请稍后重试。');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="ai-settings">
      <div className="ai-settings-heading">
        <div><strong>通义千问增强</strong><span>默认使用 qwen3-vl-flash；每次发送前仍会显示确认内容。</span></div>
        <span className={`preference-status ${hasKey ? '' : 'is-muted'}`}>{hasKey ? '已配置' : '未配置'}</span>
      </div>
      <div className="ai-key-entry">
        <KeyRound aria-hidden="true" size={14} />
        <label className="sr-only" htmlFor="dashscope-key">阿里云百炼 API Key</label>
        <input autoComplete="off" id="dashscope-key" onChange={(event) => setApiKey(event.target.value)} placeholder="输入 DashScope API Key" type="password" value={apiKey} />
        <button disabled={isSaving || !apiKey.trim()} onClick={() => void save()} type="button">安全保存 Key</button>
      </div>
      <div className="ai-key-footer">
        <span><ShieldCheck aria-hidden="true" size={12} />不会写入资料库、备份或导出文件</span>
        {hasKey ? <button disabled={isSaving} onClick={() => void clear()} type="button">移除 Key</button> : null}
      </div>
      {status ? <p aria-live="polite" className="ai-key-status">{status}</p> : null}
    </div>
  );
}
