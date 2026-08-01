import { Sparkles, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { InspectorSurface } from '../../components/material/InspectorSurface';
import { getProblemDocument, hasAiApiKey, runProblemAnalysis, saveProblemField, type AiFieldSuggestion, type ProblemDocument as ProblemDocumentModel } from '../../lib/tauri';

const fieldOrder = [
  ['stem', '题干'],
  ['own_answer', '我的作答'],
  ['standard_answer', '标准答案'],
  ['explanation', '解析'],
  ['mistake_reason', '错因'],
  ['notes', '补充笔记'],
] as const;

const labels = new Map(fieldOrder);

export function ProblemDocument({ onSaved, problemId }: { onSaved?: () => void; problemId: string }) {
  const [document, setDocument] = useState<ProblemDocumentModel | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [editingKind, setEditingKind] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [aiStage, setAiStage] = useState<'closed' | 'consent' | 'loading' | 'suggestions'>('closed');
  const [aiMode, setAiMode] = useState<'flash' | 'deep'>('flash');
  const [aiSuggestions, setAiSuggestions] = useState<AiFieldSuggestion[]>([]);
  const [aiError, setAiError] = useState<string | null>(null);

  useEffect(() => {
    setDocument(null);
    setLoadError(null);
    setSaveError(null);
    setEditingKind(null);
    setDraft('');
    void getProblemDocument(problemId).then(setDocument).catch(() => setLoadError('暂时无法打开这份题目档案。'));
  }, [problemId]);

  if (loadError) return <p className="document-notice" role="status">{loadError}</p>;
  if (!document) return <p className="document-notice">正在打开题目档案…</p>;

  const fields = new Map(document.fields.map((field) => [field.kind, field]));
  const beginEditing = (kind: string) => {
    setDraft(fields.get(kind)?.value ?? '');
    setEditingKind(kind);
    setSaveError(null);
  };
  const save = async (kind: string) => {
    setIsSaving(true);
    setSaveError(null);
    try {
      const saved = await saveProblemField(document.id, kind, draft, document.version);
      setDocument((current) => current ? {
        ...current,
        updatedAt: saved.updatedAt,
        version: saved.version,
        fields: [...current.fields.filter((field) => field.kind !== saved.kind), saved],
      } : current);
      setEditingKind(null);
      setSaveError(null);
      onSaved?.();
    } catch {
      setSaveError('保存没有完成。草稿仍在这里，请重试。');
    } finally {
      setIsSaving(false);
    }
  };

  const openAiReview = async () => {
    setAiError(null);
    if (!await hasAiApiKey()) {
      setAiError('请先在设置中保存阿里云百炼 API Key。');
      return;
    }
    setAiStage('consent');
  };

  const runAi = async () => {
    setAiStage('loading');
    setAiError(null);
    try {
      const suggestions = await runProblemAnalysis(document.id, aiMode);
      setAiSuggestions(suggestions);
      setAiStage('suggestions');
    } catch (cause) {
      setAiError(typeof cause === 'string' ? cause : 'AI 请求没有完成，请检查网络与账户后重试。');
      setAiStage('consent');
    }
  };

  const updateSuggestion = (index: number, value: string) => {
    setAiSuggestions((current) => current.map((suggestion, currentIndex) => (
      currentIndex === index ? { ...suggestion, value } : suggestion
    )));
  };

  const rejectSuggestion = (index: number) => {
    setAiSuggestions((current) => current.filter((_, currentIndex) => currentIndex !== index));
  };

  const acceptSuggestion = async (index: number) => {
    const suggestion = aiSuggestions[index];
    if (!suggestion) return;
    setIsSaving(true);
    setAiError(null);
    try {
      const saved = await saveProblemField(document.id, suggestion.kind, suggestion.value, document.version);
      setDocument((current) => current ? {
        ...current,
        updatedAt: saved.updatedAt,
        version: saved.version,
        fields: [...current.fields.filter((field) => field.kind !== saved.kind), saved],
      } : current);
      rejectSuggestion(index);
      onSaved?.();
    } catch {
      setAiError('采纳没有保存，题目可能已更新；请关闭审核器后重新打开。');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <article className="problem-document" aria-label="题目档案">
      <header className="document-header">
        <div className="document-header-row">
          <div><p className="eyebrow">待整理题目</p><h2>{fields.get('stem')?.value || '一份待补充的题目'}</h2></div>
          <button aria-label="AI 辅助整理" className="document-ai-action" onClick={() => void openAiReview()} type="button"><Sparkles aria-hidden="true" size={15} />AI 辅助整理</button>
        </div>
        {aiError && aiStage === 'closed' ? <p className="document-ai-notice" role="status">{aiError}</p> : null}
      </header>
      <div className="document-pages">
        {fieldOrder.map(([kind, label]) => {
          const field = fields.get(kind);
          return (
            <section className="document-field" key={kind}>
              <p className="document-label">{label}</p>
              {editingKind === kind ? (
                <div className="field-editor">
                  <label className="sr-only" htmlFor={`field-${kind}`}>编辑{label}</label>
                  <textarea autoFocus id={`field-${kind}`} onChange={(event) => setDraft(event.target.value)} value={draft} />
                  <div className="field-editor-actions">
                    <button onClick={() => { setEditingKind(null); setSaveError(null); }} type="button">取消</button>
                    <button className="field-save" disabled={isSaving} onClick={() => void save(kind)} type="button">{isSaving ? '正在保存…' : `保存${label}`}</button>
                  </div>
                  {saveError ? (
                    <div className="field-save-error" role="alert">
                      <span>{saveError}</span>
                      <button disabled={isSaving} onClick={() => void save(kind)} type="button">{`重试保存${label}`}</button>
                    </div>
                  ) : null}
                </div>
              ) : (
                <button aria-label={`${field?.value ? '编辑' : '补充'}${label}`} className={field?.value ? 'document-value document-field-button' : 'document-placeholder document-field-button'} onClick={() => beginEditing(kind)} type="button">
                  {field?.value || '点击补充'}
                </button>
              )}
            </section>
          );
        })}
      </div>
      {aiStage !== 'closed' ? (
        <div className="inspector-backdrop">
          <InspectorSurface>
            <section aria-label="AI 建议审核" aria-modal="true" className="ai-review-inspector" role="dialog">
              <header className="preferences-header">
                <div><p className="eyebrow">通义千问 · 可选增强</p><h2>逐字段审核建议</h2></div>
                <button aria-label="关闭 AI 审核" className="inspector-close" onClick={() => setAiStage('closed')} type="button"><X aria-hidden="true" size={17} /></button>
              </header>
              {aiStage === 'consent' || aiStage === 'loading' ? (
                <div className="ai-consent">
                  <p>本次发送这道题已经填写的字段；<strong>若原件为题图，本次会一并发送</strong>。不发送整门课程资料，也不自动写回任何答案。</p>
                  <fieldset className="ai-mode-picker" disabled={aiStage === 'loading'}>
                    <legend>分析模式</legend>
                    <label className={aiMode === 'flash' ? 'is-selected' : ''}>
                      <input aria-label="快速整理" checked={aiMode === 'flash'} name="ai-mode" onChange={() => setAiMode('flash')} type="radio" />
                      <span><strong>快速整理</strong><small>qwen3-vl-flash · 日常题目</small></span>
                    </label>
                    <label className={aiMode === 'deep' ? 'is-selected' : ''}>
                      <input aria-label="深度分析" checked={aiMode === 'deep'} name="ai-mode" onChange={() => setAiMode('deep')} type="radio" />
                      <span><strong>深度分析</strong><small>qwen3-vl-plus · 复杂推导</small></span>
                    </label>
                  </fieldset>
                  <ul><li>题目原件：图片随本次请求发送；PDF 不直接发送</li><li>教材片段：本次不发送</li><li>返回结果：逐字段审核</li></ul>
                  {aiError ? <p className="ai-error" role="status">{aiError}</p> : null}
                  <button className="primary-action" disabled={aiStage === 'loading'} onClick={() => void runAi()} type="button">{aiStage === 'loading' ? '正在生成建议…' : '确认发送给通义千问'}</button>
                </div>
              ) : (
                <div className="ai-suggestions">
                  {aiSuggestions.length === 0 ? <p className="ai-empty">没有可采纳的字段建议。</p> : null}
                  {aiSuggestions.map((suggestion, index) => {
                    const label = labels.get(suggestion.kind as typeof fieldOrder[number][0]) ?? suggestion.kind;
                    return (
                      <section className="ai-suggestion" key={`${suggestion.kind}-${index}`}>
                        <p>{label}</p>
                        <textarea aria-label={`编辑 AI ${label}建议`} onChange={(event) => updateSuggestion(index, event.target.value)} value={suggestion.value} />
                        <div><button onClick={() => rejectSuggestion(index)} type="button">拒绝</button><button disabled={isSaving} onClick={() => void acceptSuggestion(index)} type="button">{`采纳${label}`}</button></div>
                      </section>
                    );
                  })}
                  {aiError ? <p className="ai-error" role="status">{aiError}</p> : null}
                </div>
              )}
            </section>
          </InspectorSurface>
        </div>
      ) : null}
    </article>
  );
}
