import { BookOpen, FileQuestion, FileText, Search, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { searchLibrary, type LibrarySearchResult, type RecentProblem } from '../../lib/tauri';

type CommandPaletteProps = {
  open: boolean;
  onClose: () => void;
  onOpenProblem: (id: string) => void;
  onOpenCourse: (id: string) => void;
  onOpenMaterial: (courseId: string, query: string) => void;
  recentProblems: RecentProblem[];
};

type SearchState = 'idle' | 'loading' | 'success' | 'error';

const GROUPS = [
  { kind: 'problem', label: '题目', icon: FileQuestion },
  { kind: 'course', label: '课程', icon: BookOpen },
  { kind: 'material', label: '资料', icon: FileText },
] as const;

function recentProblemTitle(problem: RecentProblem) {
  return problem.title || problem.fallbackFilename || '未命名题目';
}

function resultAccessibleName(result: LibrarySearchResult) {
  if (result.kind === 'problem') return `打开题目：${result.title}`;
  if (result.kind === 'course') return `打开课程：${result.title}`;
  return `打开资料：${result.title}`;
}

export function CommandPalette({
  open,
  onClose,
  onOpenProblem,
  onOpenCourse,
  onOpenMaterial,
  recentProblems,
}: CommandPaletteProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<LibrarySearchResult[]>([]);
  const [searchState, setSearchState] = useState<SearchState>('idle');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const dialogRef = useRef<HTMLElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const requestIdRef = useRef(0);
  const trimmedQuery = query.trim();

  const orderedResults = useMemo(
    () => GROUPS.flatMap(({ kind }) => results.filter((result) => result.kind === kind)),
    [results],
  );

  const reset = () => {
    requestIdRef.current += 1;
    setQuery('');
    setResults([]);
    setSearchState('idle');
    setSelectedIndex(0);
  };

  const dismiss = () => {
    reset();
    onClose();
  };

  useEffect(() => {
    if (!open) {
      reset();
      return;
    }
    inputRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (!open || trimmedQuery.length < 2) {
      requestIdRef.current += 1;
      setResults([]);
      setSearchState('idle');
      setSelectedIndex(0);
      return;
    }

    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    setResults([]);
    setSearchState('idle');
    setSelectedIndex(0);

    const timeout = window.setTimeout(() => {
      setSearchState('loading');
      void searchLibrary(trimmedQuery, 12)
        .then((nextResults) => {
          if (requestIdRef.current !== requestId) return;
          setResults(nextResults);
          setSelectedIndex(0);
          setSearchState('success');
        })
        .catch(() => {
          if (requestIdRef.current !== requestId) return;
          setResults([]);
          setSelectedIndex(0);
          setSearchState('error');
        });
    }, 180);

    return () => {
      window.clearTimeout(timeout);
      if (requestIdRef.current === requestId) requestIdRef.current += 1;
    };
  }, [open, trimmedQuery]);

  const openResult = (result: LibrarySearchResult) => {
    if (result.kind === 'problem') onOpenProblem(result.id);
    else if (result.kind === 'course') onOpenCourse(result.id);
    else onOpenMaterial(result.courseId, trimmedQuery);
    dismiss();
  };

  const handleDialogKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      dismiss();
      return;
    }

    if (event.key !== 'Tab' || !dialogRef.current) return;

    const focusableElements = Array.from(
      dialogRef.current.querySelectorAll<HTMLElement>(
        'button:not(:disabled), input:not(:disabled), [href], [tabindex]:not([tabindex="-1"])',
      ),
    );
    if (focusableElements.length === 0) return;

    const firstElement = focusableElements[0];
    const lastElement = focusableElements.at(-1);
    if (event.shiftKey && document.activeElement === firstElement) {
      event.preventDefault();
      lastElement?.focus();
    } else if (!event.shiftKey && document.activeElement === lastElement) {
      event.preventDefault();
      firstElement.focus();
    }
  };

  const handleSearchboxKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (orderedResults.length === 0) return;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setSelectedIndex((index) => (index + 1) % orderedResults.length);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setSelectedIndex((index) => (index - 1 + orderedResults.length) % orderedResults.length);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const selected = orderedResults[selectedIndex];
      if (selected) openResult(selected);
    }
  };

  if (!open) return null;

  return (
    <div className="command-palette-backdrop" onClick={(event) => { if (event.target === event.currentTarget) dismiss(); }}>
      <section
        aria-labelledby="library-search-title"
        aria-modal="true"
        className="command-palette"
        onKeyDown={handleDialogKeyDown}
        ref={dialogRef}
        role="dialog"
        style={{ background: 'var(--paper, #ffffff)' }}
      >
        <header className="command-palette-header">
          <div>
            <p className="eyebrow">仅检索这台电脑</p>
            <h2 id="library-search-title">全局搜索</h2>
          </div>
          <button aria-label="关闭全局搜索" className="command-palette-close" onClick={dismiss} style={{ minHeight: 44, minWidth: 44 }} type="button">
            <X aria-hidden="true" size={18} />
          </button>
        </header>
        <div className="command-palette-search">
          <Search aria-hidden="true" size={18} />
          <input
            aria-label="搜索本地资料库"
            autoFocus
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={handleSearchboxKeyDown}
            placeholder="搜索题目、课程与资料"
            ref={inputRef}
            role="searchbox"
            style={{ minHeight: 44 }}
            value={query}
          />
        </div>

        {trimmedQuery.length === 0 ? (
          <section aria-labelledby="recent-search-title">
            <h3 id="recent-search-title">最近题目</h3>
            {recentProblems.length > 0 ? (
              <ul className="command-palette-results">
                {recentProblems.map((problem) => {
                  const title = recentProblemTitle(problem);
                  return (
                    <li key={problem.id}>
                      <button
                        aria-label={`打开最近题目：${title}`}
                        className="command-palette-result"
                        onClick={() => {
                          onOpenProblem(problem.id);
                          dismiss();
                        }}
                        style={{ minHeight: 44 }}
                        type="button"
                      >
                        <FileQuestion aria-hidden="true" size={17} />
                        <span><strong>{title}</strong><small>{problem.courseName || '未归类课程'}</small></span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            ) : <p>还没有最近题目。</p>}
          </section>
        ) : null}

        {trimmedQuery.length === 1 ? <p className="command-palette-guidance">再输入一个字符开始搜索。</p> : null}

        {searchState === 'loading' ? <p aria-live="polite" role="status">正在搜索…</p> : null}
        {searchState === 'error' ? <p role="alert">搜索暂时无法完成。</p> : null}
        {searchState === 'success' && orderedResults.length === 0 ? <p>没有找到相关结果。</p> : null}

        {searchState === 'success' && orderedResults.length > 0 ? (
          <div aria-label="搜索结果" className="command-palette-groups" role="region">
            {GROUPS.map(({ kind, label, icon: Icon }) => {
              const groupResults = orderedResults.filter((result) => result.kind === kind);
              if (groupResults.length === 0) return null;
              return (
                <section aria-labelledby={`search-group-${kind}`} className="command-palette-group" key={kind}>
                  <h3 id={`search-group-${kind}`}>{label}</h3>
                  <ul className="command-palette-results">
                    {groupResults.map((result) => {
                      const resultIndex = orderedResults.indexOf(result);
                      return (
                        <li key={`${result.kind}-${result.id}`}>
                          <button
                            aria-current={resultIndex === selectedIndex ? 'true' : undefined}
                            aria-label={resultAccessibleName(result)}
                            className="command-palette-result"
                            onClick={() => openResult(result)}
                            onMouseEnter={() => setSelectedIndex(resultIndex)}
                            style={{ minHeight: 44 }}
                            type="button"
                          >
                            <Icon aria-hidden="true" size={17} />
                            <span><strong>{result.title}</strong>{result.snippet ? <small>{result.snippet}</small> : null}</span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              );
            })}
          </div>
        ) : null}
      </section>
    </div>
  );
}
