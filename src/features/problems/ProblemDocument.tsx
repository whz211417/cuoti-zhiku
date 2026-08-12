import { Sparkles } from 'lucide-react';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { InspectorSurface } from '../../components/material/InspectorSurface';
import {
  getProblemDocument,
  hasAiProviderKey,
  runProblemAnalysis,
  saveProblemField,
  searchCourseMaterial,
  type AiFieldSuggestion,
  type MaterialSnippet,
  type ProblemDocument as ProblemDocumentModel,
} from '../../lib/tauri';
import type { AiProviderConfig } from '../settings/aiProviderCatalog';
import { loadAiProviderState } from '../settings/aiProviderStore';
import { AiReviewInspector, type AiReviewStage } from './AiReviewInspector';
import { saveAiSuggestionsSequentially } from './saveAiSuggestionsSequentially';

const fieldOrder = [
  ['stem', '题干'],
  ['own_answer', '我的作答'],
  ['standard_answer', '标准答案'],
  ['explanation', '解析'],
  ['mistake_reason', '错因'],
  ['notes', '补充笔记'],
] as const;

type ProblemDocumentProps = {
  onOpenAiSettings?: () => void;
  onSaved?: () => void;
  problemId: string;
};

const sameProviderTarget = (left: AiProviderConfig | null, right: AiProviderConfig | null) => (
  left?.id === right?.id && left?.selectedModel === right?.selectedModel
  && left?.visionModel === right?.visionModel && left?.baseUrl === right?.baseUrl
);

const errorMessage = (cause: unknown) => (
  typeof cause === 'string' && cause.trim()
    ? cause
    : cause instanceof Error && cause.message.trim()
      ? cause.message
      : 'AI 请求没有完成，请检查网络与账户后重试。'
);

export function ProblemDocument({ onOpenAiSettings, onSaved, problemId }: ProblemDocumentProps) {
  const [document, setDocument] = useState<ProblemDocumentModel | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [editingKind, setEditingKind] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [aiStage, setAiStage] = useState<AiReviewStage | 'closed'>('closed');
  const [aiMode, setAiMode] = useState<'flash' | 'deep'>('flash');
  const [aiSuggestions, setAiSuggestions] = useState<AiFieldSuggestion[]>([]);
  const [aiError, setAiError] = useState<string | null>(null);
  const [activeProvider, setActiveProvider] = useState<AiProviderConfig | null>(null);
  const [materialQuery, setMaterialQuery] = useState('');
  const [materialResults, setMaterialResults] = useState<MaterialSnippet[]>([]);
  const [selectedMaterials, setSelectedMaterials] = useState<MaterialSnippet[]>([]);
  const [includeOriginalImage, setIncludeOriginalImage] = useState(false);
  const [isSearchingMaterials, setIsSearchingMaterials] = useState(false);
  const activeProblemRef = useRef(problemId);
  const requestGenerationRef = useRef(0);
  const aiRequestGenerationRef = useRef(0);
  const materialSearchGenerationRef = useRef(0);
  const aiDialogRef = useRef<HTMLElement>(null);
  const aiTriggerRef = useRef<HTMLButtonElement>(null);
  const aiRestoreFocusRef = useRef<HTMLElement | null>(null);
  const isAiOpen = aiStage !== 'closed';

  useLayoutEffect(() => {
    if (activeProblemRef.current === problemId) return;
    activeProblemRef.current = problemId;
    requestGenerationRef.current += 1;
    aiRequestGenerationRef.current += 1;
    materialSearchGenerationRef.current += 1;
    setDocument(null);
    setLoadError(null);
    setSaveError(null);
    setEditingKind(null);
    setDraft('');
    setIsSaving(false);
    setAiStage('closed');
    setAiSuggestions([]);
    setAiError(null);
    setActiveProvider(null);
    setMaterialQuery('');
    setMaterialResults([]);
    setSelectedMaterials([]);
    setIncludeOriginalImage(false);
  }, [problemId]);

  useEffect(() => {
    const requestGeneration = requestGenerationRef.current + 1;
    requestGenerationRef.current = requestGeneration;
    void getProblemDocument(problemId).then((nextDocument) => {
      if (
        activeProblemRef.current === problemId
        && requestGenerationRef.current === requestGeneration
      ) setDocument(nextDocument);
    }).catch(() => {
      if (
        activeProblemRef.current === problemId
        && requestGenerationRef.current === requestGeneration
      ) setLoadError('暂时无法打开这份题目档案。');
    });
    return () => {
      if (requestGenerationRef.current === requestGeneration) {
        requestGenerationRef.current += 1;
      }
    };
  }, [problemId]);

  const closeAiReview = useCallback(() => {
    aiRequestGenerationRef.current += 1;
    materialSearchGenerationRef.current += 1;
    setAiStage('closed');
    setAiError(null);
    setIsSaving(false);
  }, []);

  useEffect(() => {
    if (!isAiOpen) return;
    const dialog = aiDialogRef.current;
    if (!dialog) return;
    const focusableElements = () => Array.from(dialog.querySelectorAll<HTMLElement>(
      'button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
    ));
    (focusableElements()[0] ?? dialog).focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeAiReview();
        return;
      }
      if (event.key !== 'Tab') return;
      const elements = focusableElements();
      if (elements.length === 0) {
        event.preventDefault();
        dialog.focus();
        return;
      }
      const first = elements[0];
      const last = elements[elements.length - 1];
      if (event.shiftKey && (globalThis.document.activeElement === first || !dialog.contains(globalThis.document.activeElement))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (globalThis.document.activeElement === last || !dialog.contains(globalThis.document.activeElement))) {
        event.preventDefault();
        first.focus();
      }
    };
    globalThis.document.addEventListener('keydown', handleKeyDown);
    return () => {
      globalThis.document.removeEventListener('keydown', handleKeyDown);
      aiRestoreFocusRef.current?.focus();
      aiRestoreFocusRef.current = null;
    };
  }, [isAiOpen, closeAiReview]);

  if (loadError) return <p className="document-notice" role="status">{loadError}</p>;
  if (!document) return <p className="document-notice">正在打开题目档案…</p>;

  const fields = new Map(document.fields.map((field) => [field.kind, field]));
  const beginEditing = (kind: string) => {
    setDraft(fields.get(kind)?.value ?? '');
    setEditingKind(kind);
    setSaveError(null);
  };
  const save = async (kind: string) => {
    if (document.id !== problemId || activeProblemRef.current !== problemId) return;
    const requestProblemId = problemId;
    const requestGeneration = requestGenerationRef.current + 1;
    requestGenerationRef.current = requestGeneration;
    const isActiveRequest = () => (
      activeProblemRef.current === requestProblemId
      && requestGenerationRef.current === requestGeneration
    );
    setIsSaving(true);
    setSaveError(null);
    try {
      const saved = await saveProblemField(document.id, kind, draft, document.version);
      if (!isActiveRequest()) return;
      setDocument((current) => current?.id === requestProblemId ? {
        ...current,
        updatedAt: saved.updatedAt,
        version: saved.version,
        fields: [...current.fields.filter((field) => field.kind !== saved.kind), saved],
      } : current);
      setEditingKind(null);
      setSaveError(null);
      onSaved?.();
    } catch {
      if (!isActiveRequest()) return;
      try {
        const latestDocument = await getProblemDocument(document.id);
        if (!isActiveRequest()) return;
        if (latestDocument.version !== document.version) {
          setDocument(latestDocument);
          setSaveError('题目已在另一处更新。已重新载入最新内容，草稿仍在这里，请重试。');
        } else {
          setSaveError('保存没有完成。草稿仍在这里，请重试。');
        }
      } catch {
        if (isActiveRequest()) setSaveError('保存没有完成。草稿仍在这里，请重试。');
      }
    } finally {
      if (isActiveRequest()) setIsSaving(false);
    }
  };

  const openAiReview = async () => {
    if (aiStage === 'closed') {
      aiRestoreFocusRef.current = globalThis.document.activeElement instanceof HTMLElement
        ? globalThis.document.activeElement
        : aiTriggerRef.current;
    }
    const generation = aiRequestGenerationRef.current + 1;
    aiRequestGenerationRef.current = generation;
    setAiError(null);
    setAiStage('checking');
    try {
      const providerState = await loadAiProviderState();
      if (activeProblemRef.current !== problemId || aiRequestGenerationRef.current !== generation) return;
      const provider = providerState.providers.find((candidate) => (
        candidate.id === providerState.activeProviderId && candidate.isEnabled
      )) ?? null;
      if (!provider || !await hasAiProviderKey(provider)) {
        if (activeProblemRef.current !== problemId || aiRequestGenerationRef.current !== generation) return;
        setActiveProvider(provider);
        setAiError(provider ? `请先在 AI 设置中保存 ${provider.displayName} 的 API Key。` : '请先选择并连接一个 AI 平台。');
        setAiStage('needs_setup');
        return;
      }
      if (activeProblemRef.current !== problemId || aiRequestGenerationRef.current !== generation) return;
      setActiveProvider(provider);
      setMaterialQuery('');
      setMaterialResults([]);
      setSelectedMaterials([]);
      setIncludeOriginalImage(false);
      setAiStage('setup');
    } catch (cause) {
      if (activeProblemRef.current !== problemId || aiRequestGenerationRef.current !== generation) return;
      setAiError(errorMessage(cause));
      setAiStage('needs_setup');
    }
  };

  const openAiSettingsFromReview = () => {
    closeAiReview();
    onOpenAiSettings?.();
  };

  const searchMaterials = async () => {
    if (!materialQuery.trim()) {
      setMaterialResults([]);
      return;
    }
    const generation = materialSearchGenerationRef.current + 1;
    materialSearchGenerationRef.current = generation;
    const requestProblemId = problemId;
    setIsSearchingMaterials(true);
    setAiError(null);
    try {
      const results = await searchCourseMaterial(document.courseId, materialQuery.trim());
      if (activeProblemRef.current !== requestProblemId || materialSearchGenerationRef.current !== generation) return;
      setMaterialResults(results);
    } catch (cause) {
      if (activeProblemRef.current !== requestProblemId || materialSearchGenerationRef.current !== generation) return;
      setAiError(errorMessage(cause));
    } finally {
      if (activeProblemRef.current === requestProblemId && materialSearchGenerationRef.current === generation) {
        setIsSearchingMaterials(false);
      }
    }
  };

  const toggleMaterial = (snippet: MaterialSnippet) => {
    setSelectedMaterials((current) => current.some((item) => item.chunkId === snippet.chunkId)
      ? current.filter((item) => item.chunkId !== snippet.chunkId)
      : current.length < 3 ? [...current, snippet] : current);
  };

  const changeMaterialQuery = (value: string) => {
    materialSearchGenerationRef.current += 1;
    setMaterialQuery(value);
    setMaterialResults([]);
    setIsSearchingMaterials(false);
    setAiError(null);
  };

  const runAi = async () => {
    if (!activeProvider) return;
    const requestProblemId = problemId;
    const requestProvider = activeProvider;
    const generation = aiRequestGenerationRef.current + 1;
    aiRequestGenerationRef.current = generation;
    setAiStage('loading');
    setAiError(null);
    try {
      const suggestions = await runProblemAnalysis(
        document.id,
        aiMode,
        requestProvider,
        selectedMaterials.map((material) => material.chunkId),
        document.version,
        includeOriginalImage,
      );
      const currentState = await loadAiProviderState();
      const currentProvider = currentState.providers.find((candidate) => (
        candidate.id === currentState.activeProviderId && candidate.isEnabled
      )) ?? null;
      if (
        activeProblemRef.current !== requestProblemId
        || aiRequestGenerationRef.current !== generation
      ) return;
      if (!sameProviderTarget(requestProvider, currentProvider)) {
        setAiError('AI 平台配置已改变，请核对后重新发送。');
        setAiStage('setup');
        return;
      }
      setAiSuggestions(suggestions);
      setAiStage('suggestions');
    } catch (cause) {
      if (activeProblemRef.current !== requestProblemId || aiRequestGenerationRef.current !== generation) return;
      setAiError(errorMessage(cause));
      setAiStage('setup');
    }
  };

  const actualModel = activeProvider
    ? includeOriginalImage ? activeProvider.visionModel : activeProvider.selectedModel
    : null;
  const hasQuestionText = document.fields.some((field) => field.value.trim());

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
    const requestProblemId = problemId;
    const requestGeneration = aiRequestGenerationRef.current;
    const isActiveRequest = () => (
      activeProblemRef.current === requestProblemId
      && aiRequestGenerationRef.current === requestGeneration
    );
    setIsSaving(true);
    setAiError(null);
    try {
      const saved = await saveProblemField(document.id, suggestion.kind, suggestion.value, document.version);
      if (!isActiveRequest()) return;
      setDocument((current) => current?.id === requestProblemId ? {
        ...current,
        updatedAt: saved.updatedAt,
        version: saved.version,
        fields: [...current.fields.filter((field) => field.kind !== saved.kind), saved],
      } : current);
      rejectSuggestion(index);
      onSaved?.();
    } catch {
      if (!isActiveRequest()) return;
      setAiError('采纳没有保存，题目可能已更新；请关闭审核器后重新打开。');
    } finally {
      if (isActiveRequest()) setIsSaving(false);
    }
  };

  const acceptBlankSuggestions = async () => {
    const blankSuggestions = aiSuggestions.filter((suggestion) => !fields.get(suggestion.kind)?.value.trim());
    if (blankSuggestions.length === 0) return;
    const requestProblemId = problemId;
    const requestGeneration = aiRequestGenerationRef.current;
    const isActiveRequest = () => (
      activeProblemRef.current === requestProblemId
      && aiRequestGenerationRef.current === requestGeneration
    );
    setIsSaving(true);
    setAiError(null);
    const result = await saveAiSuggestionsSequentially(
      blankSuggestions,
      document.version,
      async (suggestion, expectedVersion) => {
        if (!isActiveRequest()) throw new Error('AI review is no longer active');
        return saveProblemField(document.id, suggestion.kind, suggestion.value, expectedVersion);
      },
      (saved) => {
        if (!isActiveRequest()) return;
        setDocument((current) => current?.id === requestProblemId ? {
          ...current,
          updatedAt: saved.updatedAt,
          version: saved.version,
          fields: [...current.fields.filter((field) => field.kind !== saved.kind), saved],
        } : current);
        onSaved?.();
      },
    );
    if (!isActiveRequest()) return;
    const savedKinds = new Set(result.savedSuggestions.map((suggestion) => suggestion.kind));
    setAiSuggestions((current) => current.filter((suggestion) => !savedKinds.has(suggestion.kind)));
    if (result.error) {
      setAiError(result.savedSuggestions.length > 0
        ? `已采纳 ${result.savedSuggestions.length} 个字段，剩余建议仍保留`
        : '没有保存任何字段，建议仍保留，请重试');
    }
    setIsSaving(false);
  };

  return (
    <article className="problem-document" aria-label="题目档案">
      <header className="document-header">
        <div className="document-header-row">
          <div><p className="eyebrow">待整理题目</p><h2>{fields.get('stem')?.value || '一份待补充的题目'}</h2></div>
          <button aria-label="AI 辅助整理" className="document-ai-action" onClick={() => void openAiReview()} ref={aiTriggerRef} type="button"><Sparkles aria-hidden="true" size={15} />AI 辅助整理</button>
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
        <InspectorSurface>
          <AiReviewInspector
            actualModel={actualModel}
            aiMode={aiMode}
            dialogRef={aiDialogRef}
            error={aiError}
            hasImageAttachment={document.hasImageAttachment}
            hasQuestionText={hasQuestionText}
            includeOriginalImage={includeOriginalImage}
            isSaving={isSaving}
            isSearchingMaterials={isSearchingMaterials}
            materialQuery={materialQuery}
            materialResults={materialResults}
            occupiedKinds={document.fields.filter((field) => field.value.trim()).map((field) => field.kind)}
            onAcceptBlankSuggestions={() => void acceptBlankSuggestions()}
            onAcceptSuggestion={(index) => void acceptSuggestion(index)}
            onChangeMaterialQuery={changeMaterialQuery}
            onChangeMode={setAiMode}
            onClose={closeAiReview}
            onIgnoreSuggestion={rejectSuggestion}
            onOpenSettings={openAiSettingsFromReview}
            onRegenerate={() => { setAiError(null); setAiStage('setup'); }}
            onRetryProvider={() => void openAiReview()}
            onSearchMaterials={() => void searchMaterials()}
            onStart={() => void runAi()}
            onToggleImage={setIncludeOriginalImage}
            onToggleMaterial={toggleMaterial}
            onUpdateSuggestion={updateSuggestion}
            providerLabel={activeProvider?.displayName ?? null}
            selectedMaterials={selectedMaterials}
            stage={aiStage}
            suggestions={aiSuggestions}
            supportsVision={Boolean(activeProvider?.supportsVision && activeProvider.visionModel)}
          />
        </InspectorSurface>
      ) : null}
    </article>
  );
}
