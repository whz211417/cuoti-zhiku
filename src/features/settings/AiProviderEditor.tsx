import { Check, KeyRound, LoaderCircle, ShieldCheck, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import type { AiProviderConfig, AiProviderPreset } from './aiProviderCatalog';

type AiProviderEditorProps = {
  canSaveConfig: boolean;
  canSaveKey: boolean;
  canSetCurrent: boolean;
  canTest: boolean;
  configured: boolean;
  keyStatus: 'present' | 'absent' | 'unknown';
  onClearKey: () => Promise<void>;
  onConfigChange: (config: AiProviderConfig) => void;
  onSaveConfig: () => Promise<void>;
  onSaveKey: (apiKey: string) => Promise<void>;
  onSetCurrent: () => Promise<void>;
  onTest: () => Promise<void>;
  preset?: AiProviderPreset;
  provider: AiProviderConfig;
  saving: boolean;
  status: { kind: 'success' | 'error' | 'info'; message: string } | null;
};

const MIN_TIMEOUT_SECONDS = 10;
const MAX_TIMEOUT_SECONDS = 180;

const parseOrigin = (value: string) => {
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
};

const isAllowedHttpOrigin = (origin: string | null) => {
  if (!origin) return false;
  try {
    const url = new URL(origin);
    return url.protocol === 'http:' && (url.hostname === 'localhost' || url.hostname === '127.0.0.1' || url.hostname === '[::1]');
  } catch {
    return false;
  }
};

export function AiProviderEditor({
  canSaveConfig,
  canSaveKey,
  canSetCurrent,
  canTest,
  configured,
  keyStatus,
  onClearKey,
  onConfigChange,
  onSaveConfig,
  onSaveKey,
  onSetCurrent,
  onTest,
  preset,
  provider,
  saving,
  status,
}: AiProviderEditorProps) {
  const [apiKey, setApiKey] = useState('');
  const origin = useMemo(() => parseOrigin(provider.baseUrl), [provider.baseUrl]);
  const localhostHttp = isAllowedHttpOrigin(origin);
  const remoteHttp = origin?.startsWith('http:') && !localhostHttp;
  const modelOptions = preset?.models ?? [];
  const hasKey = keyStatus === 'present';

  useEffect(() => {
    setApiKey('');
  }, [provider.id]);

  const patch = (changes: Partial<AiProviderConfig>) => onConfigChange({ ...provider, ...changes });

  const saveKey = async () => {
    const value = apiKey.trim();
    if (!value || !canSaveKey) return;
    try {
      await onSaveKey(value);
      setApiKey('');
    } catch { /* parent owns the safe visible error state */ }
  };

  const clearKey = async () => {
    if (saving) return;
    try {
      await onClearKey();
    } catch { /* parent owns the safe visible error state */ }
  };

  return (
    <section aria-label={`${provider.displayName} 配置编辑器`} className="ai-provider-editor">
      <header className="ai-provider-editor-heading">
        <div>
          <p className="eyebrow">AI 平台</p>
          <h3>{provider.displayName}</h3>
          <p>{preset ? '可调整推荐模型；密钥仅保存在 Windows 凭据管理器。' : '兼容 OpenAI Chat Completions 的本地或 HTTPS 服务。'}</p>
        </div>
        <span className={`ai-provider-badge ${configured ? 'is-configured' : ''}`}>{configured ? '已配置' : '未配置'}</span>
      </header>

      <div className="ai-provider-form">
        {provider.preset === 'custom' ? (
          <label className="ai-provider-field">
            <span>兼容 API 地址</span>
            <input autoComplete="off" inputMode="url" onChange={(event) => patch({ baseUrl: event.target.value, allowInsecureLocalhost: false })} placeholder="https://api.example.com/v1" value={provider.baseUrl} />
          </label>
        ) : (
          <div className="ai-provider-readonly"><span>服务地址</span><strong>{provider.baseUrl}</strong></div>
        )}

        {remoteHttp ? <p className="ai-provider-danger" role="alert">远程 HTTP 不受支持。请改为 HTTPS；仅 localhost、127.0.0.1 或 [::1] 可在明确确认后使用 HTTP。</p> : null}
        {localhostHttp ? (
          <label className="ai-provider-localhost-confirm">
            <input aria-label="允许仅此本机地址使用 HTTP" checked={provider.allowInsecureLocalhost} onChange={(event) => patch({ allowInsecureLocalhost: event.target.checked })} type="checkbox" />
            <span>我确认仅允许此本机地址使用 HTTP：<strong>{origin}</strong></span>
          </label>
        ) : null}

        {preset ? (
          <label className="ai-provider-field">
            <span>推荐模型</span>
            <select onChange={(event) => {
              patch({ selectedModel: event.target.value, supportsVision: preset.supportsVision, visionModel: preset.defaultVisionModel });
            }} value={modelOptions.some((option) => option.id === provider.selectedModel) ? provider.selectedModel : ''}>
              <option value="">使用下方模型 ID</option>
              {modelOptions.map((model) => <option key={model.id} value={model.id}>{model.label}</option>)}
            </select>
          </label>
        ) : null}

        <label className="ai-provider-field">
          <span>模型 ID</span>
          <input autoComplete="off" onChange={(event) => patch({ selectedModel: event.target.value })} placeholder="例如 qwen3.6-flash" value={provider.selectedModel} />
        </label>

        <div className="ai-provider-grid">
          <label className="ai-provider-field">
            <span>图像能力</span>
            <select disabled={provider.preset !== 'custom'} onChange={(event) => patch({ supportsVision: event.target.value === 'yes', visionModel: event.target.value === 'yes' ? provider.visionModel : null })} value={provider.supportsVision ? 'yes' : 'no'}>
              <option value="no">仅文字</option><option value="yes">支持图片题目</option>
            </select>
          </label>
          <label className="ai-provider-field">
            <span>超时（秒）</span>
            <input max={MAX_TIMEOUT_SECONDS} min={MIN_TIMEOUT_SECONDS} onChange={(event) => patch({ requestTimeoutSeconds: Number(event.target.value) || 0 })} type="number" value={provider.requestTimeoutSeconds} />
          </label>
        </div>
        {provider.preset === 'custom' && provider.supportsVision ? <label className="ai-provider-field"><span>图片模型 ID</span><input autoComplete="off" onChange={(event) => patch({ visionModel: event.target.value })} placeholder="图片分析使用的模型 ID" value={provider.visionModel ?? ''} /></label> : null}
      </div>

      <div className="ai-provider-key-area">
        <label className="ai-provider-field ai-provider-key-field">
          <span>API Key</span>
          <div className="ai-provider-key-input"><KeyRound aria-hidden="true" size={15} /><input aria-label="API Key" autoComplete="off" onChange={(event) => setApiKey(event.target.value)} placeholder={hasKey ? '已安全保存；输入新 Key 才会替换' : '仅用于本次安全保存'} type="password" value={apiKey} /></div>
        </label>
        <div className="ai-provider-key-actions">
          <button className="ai-provider-secondary-action" disabled={saving || !canSaveKey || !apiKey.trim()} onClick={() => void saveKey()} type="button">{saving ? '正在保存…' : '安全保存 Key'}</button>
          {hasKey ? <button className="ai-provider-destructive-action" disabled={saving} onClick={() => void clearKey()} type="button"><Trash2 aria-hidden="true" size={14} />{saving ? '正在移除…' : '移除 Key'}</button> : null}
        </div>
        <p><ShieldCheck aria-hidden="true" size={13} /> Key 不会写入本地资料库、备份、导出文件或页面状态。</p>
      </div>

      <footer className="ai-provider-editor-actions">
        <button className="ai-provider-secondary-action" disabled={!canSaveConfig} onClick={() => void onSaveConfig()} type="button">保存平台设置</button>
        <button className="ai-provider-secondary-action" disabled={!canTest} onClick={() => void onTest()} type="button">{saving ? <><LoaderCircle aria-hidden="true" className="is-spinning" size={14} />正在测试…</> : '测试连接'}</button>
        <button className="ai-provider-current-action" disabled={saving || !canSetCurrent} onClick={() => void onSetCurrent()} type="button"><Check aria-hidden="true" size={15} />设为当前</button>
      </footer>
      {saving ? <p className="ai-provider-progress" role="status">正在与 {provider.displayName} 通信…</p> : null}
      {status ? <p className={`ai-provider-message is-${status.kind}`} role={status.kind === 'error' ? 'alert' : 'status'}>{status.kind === 'success' && status.message.startsWith('连接可用') ? <><strong>连接可用</strong><span>现在可以设为当前 AI 平台。</span></> : status.message}</p> : null}
    </section>
  );
}
