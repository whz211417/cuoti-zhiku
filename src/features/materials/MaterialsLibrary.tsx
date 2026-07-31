import { open } from '@tauri-apps/plugin-dialog';
import { BookMarked, FileUp, LockKeyhole, Save, Search } from 'lucide-react';
import { useEffect, useState } from 'react';
import { importCourseMaterialFile, saveCourseMaterial, searchCourseMaterial, type MaterialSnippet } from '../../lib/tauri';

export function MaterialsLibrary({
  courseId,
  initialQuery = '',
  onSaved,
}: {
  courseId: string | null;
  initialQuery?: string;
  onSaved?: () => void;
}) {
  const [filename, setFilename] = useState('');
  const [content, setContent] = useState('');
  const [status, setStatus] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [query, setQuery] = useState('');
  const [snippets, setSnippets] = useState<MaterialSnippet[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isImporting, setIsImporting] = useState(false);

  const save = async () => {
    if (!courseId || !filename.trim() || !content.trim()) return;
    setIsSaving(true);
    setStatus(null);
    try {
      await saveCourseMaterial(courseId, filename.trim(), content.trim());
      setStatus('已保存到本课程资料库。');
      setFilename('');
      setContent('');
      onSaved?.();
    } catch {
      setStatus('保存没有完成，请稍后重试。');
    } finally {
      setIsSaving(false);
    }
  };

  const search = async () => {
    if (!courseId || !query.trim()) return;
    setIsSearching(true);
    try {
      setSnippets(await searchCourseMaterial(courseId, query.trim()));
    } finally {
      setIsSearching(false);
    }
  };

  useEffect(() => {
    const nextQuery = initialQuery.trim();
    if (!courseId || !nextQuery) return;

    setQuery(nextQuery);
    setIsSearching(true);
    void searchCourseMaterial(courseId, nextQuery)
      .then(setSnippets)
      .finally(() => setIsSearching(false));
  }, [courseId, initialQuery]);

  const importFile = async () => {
    if (!courseId) return;
    const path = await open({
      multiple: false,
      filters: [{ name: '课程资料', extensions: ['pdf', 'md', 'markdown', 'txt'] }],
    });
    if (typeof path !== 'string') return;
    setIsImporting(true);
    setStatus(null);
    try {
      await importCourseMaterialFile(courseId, path);
      setStatus('已从文件提取文字并保存到本课程。');
      onSaved?.();
    } catch (error) {
      setStatus(typeof error === 'string' ? error : '文件导入没有完成，请检查格式后重试。');
    } finally {
      setIsImporting(false);
    }
  };

  if (!courseId) return (
    <section className="focus-empty" aria-label="课程资料库">
      <div className="focus-empty-icon"><BookMarked aria-hidden="true" size={24} /></div>
      <h2>先选择一门课程</h2>
      <p>课程教材、讲义与老师发的重点资料会按课程分开保存，只在该课程内被检索。</p>
    </section>
  );

  return (
    <section aria-label="课程资料库" className="materials-library">
      <header className="materials-header">
        <p className="eyebrow">本地课程依据</p>
        <div className="materials-title-row">
          <h2>把教材变成可核查的笔记索引。</h2>
          <span className="local-material-mark"><LockKeyhole aria-hidden="true" size={13} />仅本地</span>
        </div>
        <p>粘贴讲义或教材文字后，它只会保存在这台电脑，并且仅用于这门课的本地检索。</p>
      </header>
      <div className="materials-workspace">
        <aside aria-label="资料库操作" className="materials-rail">
          <div className="materials-rail-mark"><BookMarked aria-hidden="true" size={18} /></div>
          <strong>课程资料</strong>
          <span>录入</span>
          <span>检索</span>
          <p>教材、讲义和个人摘录按课程隔离保存。</p>
        </aside>
        <div className="materials-main">
          <section className="materials-editor" aria-labelledby="materials-compose-title">
            <div className="materials-section-heading">
              <div><p className="eyebrow">收录一份依据</p><h3 id="materials-compose-title">粘贴文字，留下可追溯的来源</h3></div>
              <span>01</span>
            </div>
            <button aria-label="导入 PDF 或讲义" className="material-file-action" disabled={isImporting} onClick={() => void importFile()} type="button">
              <FileUp aria-hidden="true" size={15} />
              <span><strong>{isImporting ? '正在提取文字…' : '导入 PDF 或讲义'}</strong><small>PDF · Markdown · TXT</small></span>
            </button>
            <div className="material-or-divider"><span>或者粘贴文字</span></div>
            <label>材料名称<input aria-label="材料名称" onChange={(event) => setFilename(event.target.value)} placeholder="例如：第六章 IS-LM 模型讲义" value={filename} /></label>
            <label>材料正文<textarea aria-label="材料正文" onChange={(event) => setContent(event.target.value)} placeholder="粘贴教材或讲义的文字内容…" value={content} /></label>
            <div className="materials-actions">
              <p>保存后会按片段建立本地索引；AI 未经你的确认不会读取它。</p>
              <button className="primary-action" disabled={isSaving || !filename.trim() || !content.trim()} onClick={() => void save()} type="button"><Save aria-hidden="true" size={15} />{isSaving ? '正在保存…' : '保存为本地依据'}</button>
            </div>
            {status ? <p aria-live="polite" className="material-status">{status}</p> : null}
          </section>
          <section className="materials-search" aria-label="课程资料检索">
            <div className="materials-section-heading">
              <div><p className="eyebrow">仅检索本课程</p><h3>从已有材料中找到依据</h3></div>
              <span>02</span>
            </div>
            <div className="materials-search-bar">
              <label className="sr-only" htmlFor="material-search">检索课程资料</label>
              <Search aria-hidden="true" size={15} />
              <input id="material-search" onChange={(event) => setQuery(event.target.value)} placeholder="检索这门课的教材与讲义" value={query} />
              <button disabled={isSearching || !query.trim()} onClick={() => void search()} type="button">{isSearching ? '正在检索…' : '检索'}</button>
            </div>
            {query && !isSearching && snippets.length === 0 ? <p className="materials-search-hint">输入关键词后，只会在当前课程已保存的材料中查找。</p> : null}
            <div className="materials-results">
              {snippets.map((snippet) => <article className="material-snippet" key={`${snippet.materialId}-${snippet.excerpt}`}><p>{snippet.filename}</p><div>{snippet.excerpt}</div></article>)}
            </div>
          </section>
        </div>
      </div>
    </section>
  );
}
