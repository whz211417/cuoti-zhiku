import { useEffect, useState } from 'react';
import { getProblemDocument, saveProblemField, type ProblemDocument as ProblemDocumentModel } from '../../lib/tauri';

const fieldOrder = [
  ['stem', '题干'],
  ['own_answer', '我的作答'],
  ['standard_answer', '标准答案'],
  ['explanation', '解析'],
  ['mistake_reason', '错因'],
  ['notes', '补充笔记'],
] as const;

export function ProblemDocument({ problemId }: { problemId: string }) {
  const [document, setDocument] = useState<ProblemDocumentModel | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editingKind, setEditingKind] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    setDocument(null);
    setError(null);
    void getProblemDocument(problemId).then(setDocument).catch(() => setError('暂时无法打开这份题目档案。'));
  }, [problemId]);

  if (error) return <p className="document-notice" role="status">{error}</p>;
  if (!document) return <p className="document-notice">正在打开题目档案…</p>;

  const fields = new Map(document.fields.map((field) => [field.kind, field]));
  const beginEditing = (kind: string) => {
    setDraft(fields.get(kind)?.value ?? '');
    setEditingKind(kind);
    setError(null);
  };
  const save = async (kind: string) => {
    setIsSaving(true);
    setError(null);
    try {
      const saved = await saveProblemField(document.id, kind, draft, document.updatedAt);
      setDocument((current) => current ? {
        ...current,
        updatedAt: saved.updatedAt,
        fields: [...current.fields.filter((field) => field.kind !== saved.kind), saved],
      } : current);
      setEditingKind(null);
    } catch {
      setError('保存没有完成。题目可能已在另一处更新，请刷新后重试。');
    } finally {
      setIsSaving(false);
    }
  };
  return (
    <article className="problem-document" aria-label="题目档案">
      <header className="document-header">
        <p className="eyebrow">待整理题目</p>
        <h2>{fields.get('stem')?.value || '一份待补充的题目'}</h2>
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
                    <button onClick={() => setEditingKind(null)} type="button">取消</button>
                    <button className="field-save" disabled={isSaving} onClick={() => void save(kind)} type="button">{isSaving ? '正在保存…' : `保存${label}`}</button>
                  </div>
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
    </article>
  );
}
