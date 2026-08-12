import { Image, LoaderCircle, Settings2, Sparkles, X } from 'lucide-react';
import type { RefObject } from 'react';
import type { AiFieldSuggestion, MaterialSnippet } from '../../lib/tauri';

export type AiReviewStage = 'checking' | 'needs_setup' | 'setup' | 'loading' | 'suggestions';

const fieldLabels = new Map([
  ['stem', '题干'],
  ['own_answer', '我的作答'],
  ['standard_answer', '标准答案'],
  ['explanation', '解析'],
  ['mistake_reason', '错因'],
  ['notes', '补充笔记'],
]);

type AiReviewInspectorProps = {
  actualModel: string | null;
  aiMode: 'flash' | 'deep';
  dialogRef: RefObject<HTMLElement | null>;
  error: string | null;
  hasImageAttachment: boolean;
  hasQuestionText: boolean;
  includeOriginalImage: boolean;
  isSaving: boolean;
  isSearchingMaterials: boolean;
  materialQuery: string;
  materialResults: MaterialSnippet[];
  onAcceptSuggestion: (index: number) => void;
  onChangeMaterialQuery: (value: string) => void;
  onChangeMode: (mode: 'flash' | 'deep') => void;
  onClose: () => void;
  onIgnoreSuggestion: (index: number) => void;
  onOpenSettings: () => void;
  onRegenerate: () => void;
  onRetryProvider: () => void;
  onSearchMaterials: () => void;
  onStart: () => void;
  onToggleImage: (include: boolean) => void;
  onToggleMaterial: (snippet: MaterialSnippet) => void;
  onUpdateSuggestion: (index: number, value: string) => void;
  providerLabel: string | null;
  selectedMaterials: MaterialSnippet[];
  stage: AiReviewStage;
  suggestions: AiFieldSuggestion[];
  supportsVision: boolean;
};

export function AiReviewInspector({
  actualModel,
  aiMode,
  dialogRef,
  error,
  hasImageAttachment,
  hasQuestionText,
  includeOriginalImage,
  isSaving,
  isSearchingMaterials,
  materialQuery,
  materialResults,
  onAcceptSuggestion,
  onChangeMaterialQuery,
  onChangeMode,
  onClose,
  onIgnoreSuggestion,
  onOpenSettings,
  onRegenerate,
  onRetryProvider,
  onSearchMaterials,
  onStart,
  onToggleImage,
  onToggleMaterial,
  onUpdateSuggestion,
  providerLabel,
  selectedMaterials,
  stage,
  suggestions,
  supportsVision,
}: AiReviewInspectorProps) {
  const loading = stage === 'loading';
  const canStart = hasQuestionText || (hasImageAttachment && supportsVision && includeOriginalImage);
  const sendSummary = [
    hasQuestionText ? '题目文字' : '无题目文字',
    includeOriginalImage ? '1 张题图' : '不含题图',
    `${selectedMaterials.length} 段教材`,
  ].join(' · ');
  const evidenceSummary = includeOriginalImage || selectedMaterials.length > 0
    ? [includeOriginalImage ? '题图' : null, selectedMaterials.length ? `${selectedMaterials.length} 段教材` : null].filter(Boolean).join('、')
    : '可选';

  return (
    <section aria-label="AI 建议审核" aria-modal="true" className="ai-review-inspector" ref={dialogRef} role="dialog" tabIndex={-1}>
      <header className="preferences-header">
        <div><p className="eyebrow">AI · 可选增强</p><h2>{stage === 'suggestions' ? '审核整理建议' : '整理这道题'}</h2></div>
        <button aria-label="关闭 AI 审核" className="inspector-close" onClick={onClose} type="button"><X aria-hidden="true" size={17} /></button>
      </header>

      {stage === 'checking' ? (
        <div className="ai-review-state ai-review-loading" role="status">
          <LoaderCircle aria-hidden="true" className="is-spinning" size={24} />
          <div><strong>正在检查 AI 配置</strong><span>只读取本机设置，此时不会发送题目。</span></div>
        </div>
      ) : null}

      {stage === 'needs_setup' ? (
        <div className="ai-review-state ai-needs-setup">
          <span className="ai-state-icon"><Settings2 aria-hidden="true" size={21} /></span>
          <div><p className="eyebrow">开始之前</p><h3>需要先连接 AI</h3><p>{error ?? '选择一个 AI 平台并保存 API Key 后即可开始整理。'}</p></div>
          <div className="ai-state-actions">
            <button onClick={onRetryProvider} type="button">重新检查</button>
            <button className="primary-action" onClick={onOpenSettings} type="button">前往 AI 设置</button>
          </div>
        </div>
      ) : null}

      {stage === 'setup' || stage === 'loading' ? (
        <div className="ai-review-state ai-setup">
          <div className="ai-send-summary" aria-label="本次发送范围">
            <span><Sparkles aria-hidden="true" size={16} /></span>
            <div><strong>本次只发送</strong><p>{sendSummary}</p></div>
          </div>

          <fieldset className="ai-mode-picker" disabled={loading}>
            <legend>整理方式</legend>
            <label className={aiMode === 'flash' ? 'is-selected' : ''}>
              <input aria-label="快速整理" checked={aiMode === 'flash'} name="ai-mode" onChange={() => onChangeMode('flash')} type="radio" />
              <span><strong>快速整理</strong><small>适合日常题目</small></span>
            </label>
            <label className={aiMode === 'deep' ? 'is-selected' : ''}>
              <input aria-label="深度分析" checked={aiMode === 'deep'} name="ai-mode" onChange={() => onChangeMode('deep')} type="radio" />
              <span><strong>深度分析</strong><small>适合复杂推导</small></span>
            </label>
          </fieldset>

          <details className="ai-evidence" open={!hasQuestionText}>
            <summary><span>添加依据</span><small>{evidenceSummary}</small></summary>
            <div className="ai-evidence-body">
              {hasImageAttachment ? (
                <label className="ai-image-consent">
                  <input
                    aria-label="本次发送题目原图"
                    checked={includeOriginalImage}
                    disabled={loading || !supportsVision || !actualModel}
                    onChange={(event) => onToggleImage(event.target.checked)}
                    type="checkbox"
                  />
                  <span><strong><Image aria-hidden="true" size={15} />本次发送题目原图</strong><small>{supportsVision && actualModel ? `开启后使用 ${actualModel}` : '当前平台不支持题图；仍可只发送文字'}</small></span>
                </label>
              ) : null}

              <div className="ai-material-consent">
                <label htmlFor="ai-material-query">课程教材片段（可选，最多 3 段）</label>
                <div>
                  <input
                    aria-label="搜索本课程学习资料"
                    disabled={loading}
                    id="ai-material-query"
                    onChange={(event) => onChangeMaterialQuery(event.target.value)}
                    onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); onSearchMaterials(); } }}
                    placeholder="输入知识点或关键词"
                    type="search"
                    value={materialQuery}
                  />
                  <button disabled={loading || isSearchingMaterials || !materialQuery.trim()} onClick={onSearchMaterials} type="button">{isSearchingMaterials ? '查找中…' : '查找片段'}</button>
                </div>
                {materialResults.length > 0 ? (
                  <ul aria-label="可授权的学习资料片段">
                    {materialResults.map((snippet) => {
                      const checked = selectedMaterials.some((material) => material.chunkId === snippet.chunkId);
                      return (
                        <li key={snippet.chunkId}>
                          <label>
                            <input aria-label={snippet.excerpt} checked={checked} disabled={loading || (!checked && selectedMaterials.length >= 3)} onChange={() => onToggleMaterial(snippet)} type="checkbox" />
                            <span><strong>{snippet.filename}</strong><small>{snippet.excerpt}</small></span>
                          </label>
                        </li>
                      );
                    })}
                  </ul>
                ) : null}
                {selectedMaterials.length > 0 ? (
                  <section aria-label="本次已选片段" className="ai-selected-materials">
                    <p aria-live="polite">本次已选片段 · {selectedMaterials.length}/3</p>
                    {selectedMaterials.map((snippet) => (
                      <div key={snippet.chunkId}>
                        <details open><summary>{snippet.filename}</summary><p>{snippet.excerpt}</p></details>
                        <button aria-label={`移除已选片段：${snippet.excerpt}`} disabled={loading} onClick={() => onToggleMaterial(snippet)} type="button">移除</button>
                      </div>
                    ))}
                  </section>
                ) : null}
              </div>

              <dl className="ai-scope-details">
                <div><dt>平台</dt><dd>{providerLabel ?? '尚未选择'}</dd></div>
                <div><dt>模型</dt><dd>{actualModel ?? '尚未选择'}</dd></div>
                <div><dt>写回方式</dt><dd>生成后逐字段审核</dd></div>
              </dl>
            </div>
          </details>

          {!canStart ? <p className="ai-error" role="status">题目还没有可发送的文字。请先补充题干，或在上方授权发送题图。</p> : null}
          {error ? <p className="ai-error" role="status">{error}</p> : null}
          <button className="primary-action ai-start-action" disabled={loading || !canStart} onClick={onStart} type="button">
            {loading ? <><LoaderCircle aria-hidden="true" className="is-spinning" size={17} />正在生成建议…</> : <><Sparkles aria-hidden="true" size={17} />开始整理</>}
          </button>
        </div>
      ) : null}

      {stage === 'suggestions' ? (
        <div className="ai-review-state ai-suggestions">
          <div className="ai-result-toolbar"><p>已生成 {suggestions.length} 项建议</p><button disabled={isSaving} onClick={onRegenerate} type="button">重新生成</button></div>
          {suggestions.length === 0 ? <p className="ai-empty">没有需要修改的字段建议。</p> : null}
          {suggestions.map((suggestion, index) => {
            const label = fieldLabels.get(suggestion.kind) ?? suggestion.kind;
            return (
              <section className="ai-suggestion" key={`${suggestion.kind}-${index}`}>
                <p>{label}</p>
                <textarea aria-label={`编辑 AI ${label}建议`} disabled={isSaving} onChange={(event) => onUpdateSuggestion(index, event.target.value)} value={suggestion.value} />
                <div><button disabled={isSaving} onClick={() => onIgnoreSuggestion(index)} type="button">忽略</button><button disabled={isSaving} onClick={() => onAcceptSuggestion(index)} type="button">{`采纳${label}`}</button></div>
              </section>
            );
          })}
          {error ? <p className="ai-error" role="status">{error}</p> : null}
        </div>
      ) : null}
    </section>
  );
}
