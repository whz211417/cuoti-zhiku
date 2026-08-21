import { open } from '@tauri-apps/plugin-dialog';
import { BookMarked, FileUp, LockKeyhole, RotateCcw, Save, Search, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  importCourseMaterialFile,
  listCourseMaterials,
  purgeCourseMaterial,
  restoreCourseMaterial,
  saveCourseMaterial,
  searchCourseMaterial,
  trashCourseMaterial,
  type CourseMaterial,
  type MaterialSnippet,
} from '../../lib/tauri';

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
  const [searchError, setSearchError] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [materials, setMaterials] = useState<CourseMaterial[]>([]);
  const [trashedMaterials, setTrashedMaterials] = useState<CourseMaterial[]>([]);
  const [showTrash, setShowTrash] = useState(false);
  const [pendingRemoval, setPendingRemoval] = useState<CourseMaterial | null>(null);
  const [pendingPurge, setPendingPurge] = useState<CourseMaterial | null>(null);
  const [isRemoving, setIsRemoving] = useState(false);
  const processedInitialQueryRef = useRef<string | null>(null);
  const activeCourseRef = useRef(courseId);
  const requestGenerationRef = useRef(0);
  const successfulSearchRef = useRef<string | null>(null);

  const loadMaterials = useCallback(async (nextCourseId = courseId, deletedOnly = false) => {
    if (!nextCourseId) {
      if (deletedOnly) setTrashedMaterials([]);
      else setMaterials([]);
      return;
    }
    try {
      const nextMaterials = await listCourseMaterials(nextCourseId, deletedOnly);
      if (deletedOnly) setTrashedMaterials(nextMaterials);
      else setMaterials(nextMaterials);
    }
    catch { setStatus('资料列表没有加载完成，请稍后重试。'); }
  }, [courseId]);

  const refreshMaterialLists = useCallback(async (nextCourseId = courseId) => {
    await Promise.all([loadMaterials(nextCourseId), loadMaterials(nextCourseId, true)]);
  }, [courseId, loadMaterials]);

  const save = async () => {
    if (!courseId || !filename.trim() || !content.trim()) return;
    setIsSaving(true);
    setStatus(null);
    try {
      await saveCourseMaterial(courseId, filename.trim(), content.trim());
      setStatus('已保存到本课程资料库。');
      setFilename('');
      setContent('');
      await refreshMaterialLists();
      onSaved?.();
    } catch {
      setStatus('保存没有完成，请稍后重试。');
    } finally {
      setIsSaving(false);
    }
  };

  const runSearch = useCallback(async (searchQuery: string) => {
    const normalizedQuery = searchQuery.trim();
    if (!courseId || !normalizedQuery) return;
    const searchKey = JSON.stringify([courseId, normalizedQuery]);
    const requestGeneration = requestGenerationRef.current + 1;
    requestGenerationRef.current = requestGeneration;
    if (successfulSearchRef.current !== searchKey) setSnippets([]);
    setIsSearching(true);
    setSearchError(false);
    try {
      const nextSnippets = await searchCourseMaterial(courseId, normalizedQuery);
      if (
        requestGenerationRef.current !== requestGeneration
        || activeCourseRef.current !== courseId
      ) return;
      successfulSearchRef.current = searchKey;
      setSnippets(nextSnippets);
    } catch {
      if (
        requestGenerationRef.current === requestGeneration
        && activeCourseRef.current === courseId
      ) setSearchError(true);
    } finally {
      if (
        requestGenerationRef.current === requestGeneration
        && activeCourseRef.current === courseId
      ) setIsSearching(false);
    }
  }, [courseId]);

  const search = () => runSearch(query.trim());

  useLayoutEffect(() => {
    if (activeCourseRef.current === courseId) return;
    activeCourseRef.current = courseId;
    requestGenerationRef.current += 1;
    successfulSearchRef.current = null;
    processedInitialQueryRef.current = null;
    setQuery('');
    setSnippets([]);
    setSearchError(false);
    setIsSearching(false);
    setMaterials([]);
    setTrashedMaterials([]);
    setShowTrash(false);
    setPendingRemoval(null);
    setPendingPurge(null);
  }, [courseId]);

  useEffect(() => { void refreshMaterialLists(courseId); }, [courseId, refreshMaterialLists]);

  useEffect(() => {
    const nextQuery = initialQuery.trim();
    if (!courseId || !nextQuery) {
      processedInitialQueryRef.current = null;
      setSearchError(false);
      return;
    }
    const searchKey = JSON.stringify([courseId, nextQuery]);
    if (processedInitialQueryRef.current === searchKey) return;
    processedInitialQueryRef.current = searchKey;

    setQuery(nextQuery);
    void runSearch(nextQuery);
  }, [courseId, initialQuery, runSearch]);

  const updateQuery = (nextQuery: string) => {
    const searchKey = courseId ? JSON.stringify([courseId, nextQuery.trim()]) : null;
    requestGenerationRef.current += 1;
    setQuery(nextQuery);
    setIsSearching(false);
    setSearchError(false);
    if (successfulSearchRef.current !== searchKey) setSnippets([]);
  };

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
      await refreshMaterialLists();
      setStatus('已从文件提取文字并保存到本课程。');
      onSaved?.();
    } catch (error) {
      setStatus(typeof error === 'string' ? error : '文件导入没有完成，请检查格式后重试。');
    } finally {
      setIsImporting(false);
    }
  };

  const confirmRemoval = async () => {
    if (!courseId || !pendingRemoval) return;
    setIsRemoving(true);
    try {
      await trashCourseMaterial(courseId, pendingRemoval.id);
      await refreshMaterialLists();
      setPendingRemoval(null);
      setStatus('已移入最近删除，可在 30 天内恢复。');
      onSaved?.();
    } catch { setStatus('资料没有移入最近删除，请稍后重试。'); }
    finally { setIsRemoving(false); }
  };

  const restore = async (material: CourseMaterial) => {
    if (!courseId) return;
    setIsRemoving(true);
    try {
      await restoreCourseMaterial(courseId, material.id);
      await refreshMaterialLists();
      setStatus(`已恢复“${material.filename}”。`);
      onSaved?.();
    } catch { setStatus('资料没有恢复，请稍后重试。'); }
    finally { setIsRemoving(false); }
  };

  const confirmPurge = async () => {
    if (!courseId || !pendingPurge) return;
    setIsRemoving(true);
    try {
      await purgeCourseMaterial(courseId, pendingPurge.id);
      await refreshMaterialLists();
      setPendingPurge(null);
      setStatus('已永久清除该资料及其本地索引。');
      onSaved?.();
    } catch { setStatus('资料没有永久清除，请稍后重试。'); }
    finally { setIsRemoving(false); }
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
              <input id="material-search" onChange={(event) => updateQuery(event.target.value)} placeholder="检索这门课的教材与讲义" value={query} />
              <button disabled={isSearching || !query.trim()} onClick={() => void search()} type="button">{isSearching ? '正在检索…' : '检索'}</button>
            </div>
            {searchError ? (
              <div className="materials-search-error" role="alert">
                <span>资料检索没有完成，仍为你保留上一次结果。</span>
                <button disabled={isSearching} onClick={() => void runSearch(query.trim())} type="button">重试资料检索</button>
              </div>
            ) : null}
            {query && !isSearching && snippets.length === 0 ? <p className="materials-search-hint">输入关键词后，只会在当前课程已保存的材料中查找。</p> : null}
            <div className="materials-results">
              {snippets.map((snippet) => <article className="material-snippet" key={snippet.chunkId}><p>{snippet.filename}</p><div>{snippet.excerpt}</div></article>)}
            </div>
          </section>
          <section className="materials-saved" aria-label="已保存资料">
            <div className="materials-section-heading"><div><p className="eyebrow">本课程资料</p><h3>已保存的本地依据</h3></div><span>{String(materials.length).padStart(2, '0')}</span></div>
            {materials.length === 0 ? <p className="materials-saved-empty">还没有已保存资料。导入或粘贴后会在这里出现。</p> : <ul className="materials-saved-list">{materials.map((material) => <li key={material.id}><BookMarked aria-hidden="true" size={16} /><span>{material.filename}</span><button aria-label={`移入最近删除 ${material.filename}`} onClick={() => setPendingRemoval(material)} type="button"><Trash2 aria-hidden="true" size={15} /></button></li>)}</ul>}
            <button className="material-trash-toggle" onClick={() => setShowTrash((current) => !current)} type="button">{showTrash ? '收起最近删除' : `最近删除${trashedMaterials.length ? ` · ${trashedMaterials.length}` : ''}`}</button>
            {showTrash ? <div className="materials-trash" aria-label="最近删除">{trashedMaterials.length === 0 ? <p className="materials-saved-empty">最近删除为空。</p> : <ul className="materials-saved-list">{trashedMaterials.map((material) => <li key={material.id}><Trash2 aria-hidden="true" size={16} /><span>{material.filename}</span><button aria-label={`恢复 ${material.filename}`} disabled={isRemoving} onClick={() => void restore(material)} type="button"><RotateCcw aria-hidden="true" size={15} /></button><button aria-label={`永久删除 ${material.filename}`} disabled={isRemoving} onClick={() => setPendingPurge(material)} type="button"><Trash2 aria-hidden="true" size={15} /></button></li>)}</ul>}</div> : null}
          </section>
        </div>
      </div>
      {pendingRemoval ? <div className="material-remove-dialog" role="dialog" aria-modal="true" aria-label="移入最近删除"><div className="material-remove-dialog__surface"><p className="eyebrow">本地资料回收站</p><h3>移入最近删除“{pendingRemoval.filename}”吗？</h3><p>它会立即停止被检索或用于 AI 参考；30 天内可恢复，之后才会自动清理。</p><div><button disabled={isRemoving} onClick={() => setPendingRemoval(null)} type="button">取消</button><button className="material-remove-confirm" disabled={isRemoving} onClick={() => void confirmRemoval()} type="button">{isRemoving ? '正在移入…' : '移入最近删除'}</button></div></div></div> : null}
      {pendingPurge ? <div className="material-remove-dialog" role="dialog" aria-modal="true" aria-label="永久清除资料"><div className="material-remove-dialog__surface"><p className="eyebrow">不可恢复</p><h3>永久清除“{pendingPurge.filename}”吗？</h3><p>这会永久删除本地检索记录；如果没有其他资料引用同一原件，也会清除应用托管的原件副本。</p><div><button disabled={isRemoving} onClick={() => setPendingPurge(null)} type="button">取消</button><button className="material-remove-confirm" disabled={isRemoving} onClick={() => void confirmPurge()} type="button">{isRemoving ? '正在清除…' : '永久清除'}</button></div></div></div> : null}
    </section>
  );
}
