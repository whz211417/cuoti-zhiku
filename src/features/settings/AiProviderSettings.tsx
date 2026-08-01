import { AlertTriangle, Check, ChevronRight, CircleAlert, Plus, RefreshCw } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import {
  clearAiProviderKey,
  getAiCredentialMigrationStatus,
  hasAiProviderKey,
  retryAiCredentialMigration,
  saveAiProviderKey,
  testAiProvider,
  type AiCredentialMigrationStatus,
} from '../../lib/tauri';
import { AiProviderEditor } from './AiProviderEditor';
import {
  AI_PROVIDER_PRESETS,
  createCustomProvider,
  createPresetProvider,
  type AiProviderConfig,
  type AiProviderState,
  type PresetAiProviderId,
} from './aiProviderCatalog';
import { loadAiProviderState, saveAiProviderState } from './aiProviderStore';

type Message = { kind: 'success' | 'error' | 'info'; message: string } | null;
type Selection = PresetAiProviderId | 'custom';

const fingerprint = (provider: AiProviderConfig) => JSON.stringify({
  id: provider.id,
  displayName: provider.displayName,
  baseUrl: provider.baseUrl.trim(),
  selectedModel: provider.selectedModel.trim(),
  visionModel: provider.visionModel,
  supportsVision: provider.supportsVision,
  requestTimeoutSeconds: provider.requestTimeoutSeconds,
  preset: provider.preset,
  allowInsecureLocalhost: provider.allowInsecureLocalhost,
});

const getErrorMessage = (error: unknown, fallback: string) => error instanceof Error && error.message ? error.message : fallback;
const emptyState = (): AiProviderState => ({ providers: [], activeProviderId: null });

const providerForSelection = (state: AiProviderState, selection: Selection, customDraft: AiProviderConfig | null) => {
  if (selection === 'custom') return state.providers.find((provider) => provider.preset === 'custom') ?? customDraft ?? createCustomProvider();
  return state.providers.find((provider) => provider.id === selection) ?? createPresetProvider(selection);
};

export function AiProviderSettings() {
  const [state, setState] = useState<AiProviderState>(emptyState);
  const [selection, setSelection] = useState<Selection>('bailian');
  const [customDraft, setCustomDraft] = useState<AiProviderConfig | null>(null);
  const [draft, setDraft] = useState<AiProviderConfig>(() => createPresetProvider('bailian'));
  const [hasKeyById, setHasKeyById] = useState<Record<string, boolean>>({});
  const [message, setMessage] = useState<Message>(null);
  const [migrationStatus, setMigrationStatus] = useState<AiCredentialMigrationStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isWorking, setIsWorking] = useState(false);
  const [successFingerprint, setSuccessFingerprint] = useState<string | null>(null);
  const aliveRef = useRef(true);
  const requestRef = useRef(0);
  const workRef = useRef(false);
  const draftRef = useRef(draft);

  const configured = state.providers.some((provider) => provider.id === draft.id);
  const hasKey = hasKeyById[draft.id] ?? false;
  const activeConfig = state.providers.find((provider) => provider.id === state.activeProviderId) ?? null;

  const refreshKeyStatus = async (providerId: string, token = requestRef.current) => {
    try {
      const hasKeyResult = await hasAiProviderKey(providerId);
      if (aliveRef.current && token === requestRef.current) setHasKeyById((previous) => ({ ...previous, [providerId]: hasKeyResult }));
      return hasKeyResult;
    } catch {
      if (aliveRef.current && token === requestRef.current) setHasKeyById((previous) => ({ ...previous, [providerId]: false }));
      return false;
    }
  };

  useEffect(() => {
    aliveRef.current = true;
    const token = ++requestRef.current;
    void (async () => {
      try {
        const [loaded, migration] = await Promise.all([loadAiProviderState(), getAiCredentialMigrationStatus()]);
        if (!aliveRef.current || token !== requestRef.current) return;
        const initialSelection = loaded.activeProviderId && AI_PROVIDER_PRESETS.some((preset) => preset.id === loaded.activeProviderId)
          ? loaded.activeProviderId as PresetAiProviderId
          : loaded.providers.find((provider) => provider.preset === 'custom') ? 'custom' : 'bailian';
        const initialCustom = loaded.providers.find((provider) => provider.preset === 'custom') ?? null;
        const initialDraft = providerForSelection(loaded, initialSelection, initialCustom);
        setState(loaded);
        setSelection(initialSelection);
        setCustomDraft(initialCustom);
        setDraft(initialDraft);
        setMigrationStatus(migration);
        void Promise.all([...new Set([...AI_PROVIDER_PRESETS.map((preset) => preset.id), ...loaded.providers.map((provider) => provider.id)])].map((id) => refreshKeyStatus(id, token)));
      } catch (error) {
        if (aliveRef.current && token === requestRef.current) setMessage({ kind: 'error', message: getErrorMessage(error, '无法读取 AI 平台设置。请稍后重试。') });
      } finally {
        if (aliveRef.current && token === requestRef.current) setIsLoading(false);
      }
    })();
    return () => { aliveRef.current = false; };
  }, []);

  useEffect(() => {
    draftRef.current = draft;
  }, [draft]);

  const selectProvider = (next: Selection) => {
    const token = ++requestRef.current;
    const nextDraft = providerForSelection(state, next, customDraft);
    setSelection(next);
    draftRef.current = nextDraft;
    setDraft(nextDraft);
    if (next === 'custom' && !customDraft) setCustomDraft(nextDraft);
    setMessage(null);
    setSuccessFingerprint(null);
    void refreshKeyStatus(nextDraft.id, token);
  };

  const updateDraft = (next: AiProviderConfig) => {
    draftRef.current = next;
    setDraft(next);
    if (next.preset === 'custom') setCustomDraft(next);
    setSuccessFingerprint((current) => current === fingerprint(next) ? current : null);
    setMessage(null);
  };

  const persist = async (next: AiProviderState, successMessage?: string) => {
    await saveAiProviderState(next);
    if (!aliveRef.current) return;
    setState(next);
    if (successMessage) setMessage({ kind: 'success', message: successMessage });
  };

  const saveConfig = async () => {
    if (workRef.current) return;
    workRef.current = true;
    setIsWorking(true);
    setMessage(null);
    try {
      const previous = state.providers.find((provider) => provider.id === draft.id);
      const unchangedActive = previous && state.activeProviderId === draft.id && fingerprint(previous) === fingerprint(draft);
      const savedDraft = { ...draft, isEnabled: Boolean(unchangedActive || successFingerprint === fingerprint(draft)) };
      const next: AiProviderState = {
        providers: [...state.providers.filter((provider) => provider.id !== draft.id), savedDraft],
        activeProviderId: unchangedActive || successFingerprint === fingerprint(draft) ? draft.id : state.activeProviderId === draft.id ? null : state.activeProviderId,
      };
      await persist(next, '平台设置已保存在本机。连接通过后可将它设为当前。');
    } catch (error) {
      if (aliveRef.current) setMessage({ kind: 'error', message: getErrorMessage(error, '无法保存平台设置；上一次可用配置未被替换。') });
    } finally {
      workRef.current = false;
      if (aliveRef.current) setIsWorking(false);
    }
  };

  const saveKey = async (apiKey: string) => {
    const providerId = draft.id;
    try {
      await saveAiProviderKey(providerId, apiKey);
      if (aliveRef.current && draftRef.current.id === providerId) {
        setHasKeyById((previous) => ({ ...previous, [providerId]: true }));
        setMessage({ kind: 'success', message: 'Key 已保存到 Windows 凭据管理器。' });
      }
    } catch (error) {
      if (aliveRef.current) setMessage({ kind: 'error', message: getErrorMessage(error, 'Key 未能保存。请确认 Windows 凭据管理器可用。') });
      throw error;
    }
  };

  const clearKey = async () => {
    const providerId = draft.id;
    try {
      await clearAiProviderKey(providerId);
      if (aliveRef.current && draftRef.current.id === providerId) {
        setHasKeyById((previous) => ({ ...previous, [providerId]: false }));
        setSuccessFingerprint(null);
        setMessage({ kind: 'success', message: '已从 Windows 凭据管理器移除 Key。' });
      }
    } catch (error) {
      if (aliveRef.current) setMessage({ kind: 'error', message: getErrorMessage(error, 'Key 未能移除。请稍后重试。') });
      throw error;
    }
  };

  const testConnection = async () => {
    if (workRef.current) return;
    const testedFingerprint = fingerprint(draft);
    const testedId = draft.id;
    workRef.current = true;
    setIsWorking(true);
    setMessage(null);
    try {
      const result = await testAiProvider(draft);
      if (!result.authenticated || !result.modelAvailable) throw new Error('连接未通过身份或模型验证。');
      if (!aliveRef.current || draftRef.current.id !== testedId || fingerprint(draftRef.current) !== testedFingerprint) return;
      setSuccessFingerprint(testedFingerprint);
      setMessage({ kind: 'success', message: '连接可用。现在可以设为当前 AI 平台。' });
    } catch (error) {
      if (aliveRef.current && draftRef.current.id === testedId && fingerprint(draftRef.current) === testedFingerprint) {
        setSuccessFingerprint(null);
        setMessage({ kind: 'error', message: getErrorMessage(error, '连接测试失败；当前可用配置没有改变。') });
      }
    } finally {
      workRef.current = false;
      if (aliveRef.current) setIsWorking(false);
    }
  };

  const setCurrent = async () => {
    const existing = state.providers.find((provider) => provider.id === draft.id);
    const allowed = successFingerprint === fingerprint(draft)
      || Boolean(existing && state.activeProviderId === draft.id && fingerprint(existing) === fingerprint(draft));
    if (!allowed || workRef.current) return;
    workRef.current = true;
    setIsWorking(true);
    setMessage(null);
    try {
      const saved = { ...draft, isEnabled: true };
      await persist({ providers: [...state.providers.filter((provider) => provider.id !== saved.id), saved], activeProviderId: saved.id }, '已设为当前 AI 平台。');
    } catch (error) {
      if (aliveRef.current) setMessage({ kind: 'error', message: getErrorMessage(error, '无法更新当前 AI 平台；原有选择保持不变。') });
    } finally {
      workRef.current = false;
      if (aliveRef.current) setIsWorking(false);
    }
  };

  const retryMigration = async () => {
    if (isWorking) return;
    setIsWorking(true);
    try {
      const result = await retryAiCredentialMigration();
      if (aliveRef.current) {
        setMigrationStatus(result);
        setMessage({ kind: result === 'migrated' || result === 'not_needed' ? 'success' : 'error', message: result === 'migrated' ? '旧 Key 已安全迁移。' : '迁移仍未完成；不会显示或复制任何 Key。' });
      }
    } catch (error) {
      if (aliveRef.current) setMessage({ kind: 'error', message: getErrorMessage(error, '迁移重试失败；现有凭据未被改变。') });
    } finally {
      if (aliveRef.current) setIsWorking(false);
    }
  };

  return (
    <section className="ai-provider-settings" aria-label="AI 多平台设置">
      <header className="ai-provider-settings-toolbar">
        <div><p className="eyebrow">本地 AI</p><h3>选择你的推理引擎</h3></div>
        <p>题目与教材只会在你发起分析并确认后发送。</p>
      </header>

      {(migrationStatus === 'conflict' || migrationStatus === 'failed') ? (
        <div className="ai-provider-migration" role="alert"><AlertTriangle aria-hidden="true" size={16} /><span>{migrationStatus === 'conflict' ? '检测到旧版凭据与新平台凭据冲突，未自动覆盖。' : '旧版凭据迁移尚未完成，现有 Key 保持安全。'}</span><button disabled={isWorking} onClick={() => void retryMigration()} type="button"><RefreshCw aria-hidden="true" size={14} />重试迁移</button></div>
      ) : null}

      <div className="ai-provider-layout">
        <nav aria-label="AI 平台列表" className="ai-provider-list">
          {AI_PROVIDER_PRESETS.map((preset) => {
            const listed = state.providers.find((provider) => provider.id === preset.id);
            const listConfigured = Boolean(listed || hasKeyById[preset.id]);
            return <button aria-current={selection === preset.id ? 'page' : undefined} className={selection === preset.id ? 'is-selected' : ''} key={preset.id} onClick={() => selectProvider(preset.id)} type="button"><span><strong>{preset.displayName}</strong><small>{listConfigured ? '已配置' : '未配置'}</small></span>{state.activeProviderId === preset.id ? <Check aria-label="当前平台" size={15} /> : <ChevronRight aria-hidden="true" size={15} />}</button>;
          })}
          <button aria-current={selection === 'custom' ? 'page' : undefined} aria-label="自定义兼容平台" className={`ai-provider-custom ${selection === 'custom' ? 'is-selected' : ''}`} onClick={() => selectProvider('custom')} type="button"><Plus aria-hidden="true" size={15} /><span><strong>自定义兼容平台</strong><small>{state.providers.some((provider) => provider.preset === 'custom') ? '已配置' : '添加服务'}</small></span>{state.activeProviderId === draft.id && selection === 'custom' ? <Check aria-label="当前平台" size={15} /> : null}</button>
        </nav>

        {isLoading ? <p className="ai-provider-loading" role="status">正在读取本机 AI 设置…</p> : <AiProviderEditor activeProviderId={state.activeProviderId} configured={configured} hasKey={hasKey} onClearKey={clearKey} onConfigChange={updateDraft} onSaveConfig={saveConfig} onSaveKey={saveKey} onSetCurrent={setCurrent} onTest={testConnection} preset={AI_PROVIDER_PRESETS.find((preset) => preset.id === draft.preset)} provider={draft} saving={isWorking} status={message} testSucceededForCurrentForm={successFingerprint === fingerprint(draft)} />}
      </div>
      {activeConfig ? <p className="ai-provider-active-note"><Check aria-hidden="true" size={13} />当前使用：{activeConfig.displayName} · {activeConfig.selectedModel}</p> : <p className="ai-provider-active-note is-muted"><CircleAlert aria-hidden="true" size={13} />尚未选择当前 AI 平台；本地整理和复习不受影响。</p>}
    </section>
  );
}
