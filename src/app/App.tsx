import { useGSAP } from '@gsap/react';
import { gsap } from 'gsap';
import { AlertCircle, Archive, BookOpenCheck, ChevronLeft, Inbox, LayoutDashboard, RefreshCw, Search, Settings, ShieldCheck, Upload, X } from 'lucide-react';
import { type CSSProperties, useCallback, useEffect, useRef, useState } from 'react';
import { DynamicControlSurface } from '../components/material/DynamicControlSurface';
import { InspectorSurface } from '../components/material/InspectorSurface';
import { createBackup } from '../features/backup/createBackup';
import { restoreBackup } from '../features/backup/restoreBackup';
import { ArchiveLibrary } from '../features/archive/ArchiveLibrary';
import { CourseSidebar } from '../features/courses/CourseSidebar';
import { LearningDashboard } from '../features/dashboard/LearningDashboard';
import { saveProblemBook, type BookKind } from '../features/export/exportBooks';
import { GlobalFileDrop } from '../features/ingest/GlobalFileDrop';
import { IngestDropzone } from '../features/inbox/IngestDropzone';
import { selectProblemFiles } from '../features/inbox/selectProblemFiles';
import { selectCourseMaterialFile } from '../features/materials/selectCourseMaterialFile';
import { ProblemDocument } from '../features/problems/ProblemDocument';
import { ReviewReader } from '../features/review/ReviewReader';
import { CommandPalette } from '../features/search/CommandPalette';
import { AiSettings } from '../features/settings/AiSettings';
import { localCalendarDate, timeGreeting } from '../lib/dates';
import { getMotionPreferences } from '../lib/preferences';
import { completeReview, getDueReviewProblems, importCourseMaterialFile, type Course, type DashboardOverview, type RecentProblem, type ReviewProblem } from '../lib/tauri';

type Workspace = 'overview' | 'inbox' | 'review' | 'archive';

const workspaceTitles: Record<Workspace, { eyebrow: string; title: string }> = {
  overview: { eyebrow: '学习节奏', title: '学习总览' },
  inbox: { eyebrow: '本地资料库', title: '待整理' },
  review: { eyebrow: '专注复习', title: '今日复习' },
  archive: { eyebrow: '个人档案', title: '全部档案' },
};

export function App() {
  const [selectedProblemId, setSelectedProblemId] = useState<string | null>(null);
  const [selectedCourseId, setSelectedCourseId] = useState<string | null>(null);
  const [workspace, setWorkspace] = useState<Workspace>('overview');
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isIngesting, setIsIngesting] = useState(false);
  const [courseCreateRequestToken, setCourseCreateRequestToken] = useState(0);
  const [materialImportError, setMaterialImportError] = useState<string | null>(null);
  const [materialInitialQuery, setMaterialInitialQuery] = useState('');
  const [refreshToken, setRefreshToken] = useState(0);
  const [reviewQueue, setReviewQueue] = useState<ReviewProblem[]>([]);
  const [isReviewLoading, setIsReviewLoading] = useState(false);
  const [reviewLoadError, setReviewLoadError] = useState<string | null>(null);
  const [isGrading, setIsGrading] = useState(false);
  const [gradeError, setGradeError] = useState<string | null>(null);
  const [failedGrade, setFailedGrade] = useState<'forgot' | 'hard' | 'familiar' | 'mastered' | null>(null);
  const [recentProblems, setRecentProblems] = useState<RecentProblem[]>([]);
  const [exportStatus, setExportStatus] = useState<string | null>(null);
  const [exportingBook, setExportingBook] = useState<BookKind | null>(null);
  const [isBackingUp, setIsBackingUp] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);
  const searchTriggerRef = useRef<HTMLButtonElement>(null);
  const settingsTriggerRef = useRef<HTMLButtonElement>(null);
  const settingsDialogRef = useRef<HTMLElement>(null);
  const settingsRestoreFocusRef = useRef<HTMLElement | null>(null);
  const gradeInFlightRef = useRef(false);
  const pendingMaterialPathRef = useRef<string | null>(null);
  const reviewRequestRef = useRef(0);
  const activeTitle = selectedProblemId ? { eyebrow: '本地资料库', title: '题目档案' } : workspaceTitles[workspace];
  const problemBackLabel = workspace === 'archive'
    ? '返回全部档案'
    : workspace === 'overview'
      ? '返回学习总览'
      : '返回待整理';
  const activeNavIndex = selectedProblemId
    ? null
    : workspace === 'overview'
      ? 0
      : workspace === 'inbox'
        ? 1
        : workspace === 'review'
          ? 2
          : 3;

  const refreshOverview = () => setRefreshToken((token) => token + 1);
  const rememberOverview = useCallback((overview: DashboardOverview) => {
    setRecentProblems(overview.recentProblems);
  }, []);

  const closeSearch = () => {
    setIsSearchOpen(false);
    searchTriggerRef.current?.focus();
  };

  const loadReviewQueue = useCallback(async () => {
    const request = reviewRequestRef.current + 1;
    reviewRequestRef.current = request;
    setIsReviewLoading(true);
    setReviewQueue([]);
    setReviewLoadError(null);
    setGradeError(null);
    setFailedGrade(null);
    const today = localCalendarDate();
    try {
      const queue = await getDueReviewProblems(today);
      if (reviewRequestRef.current === request) setReviewQueue(queue);
    } catch {
      if (reviewRequestRef.current === request) {
        setReviewLoadError('复习队列暂时无法读取。请重试。');
      }
    } finally {
      if (reviewRequestRef.current === request) setIsReviewLoading(false);
    }
  }, []);

  useEffect(() => {
    if (workspace !== 'review') {
      reviewRequestRef.current += 1;
      return;
    }
    void loadReviewQueue();
    return () => {
      reviewRequestRef.current += 1;
    };
  }, [loadReviewQueue, workspace]);

  const closeSettings = useCallback(() => setIsSettingsOpen(false), []);

  const openSettings = () => {
    settingsRestoreFocusRef.current = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : settingsTriggerRef.current;
    setIsSettingsOpen(true);
  };

  useEffect(() => {
    if (!isSettingsOpen) return;
    const dialog = settingsDialogRef.current;
    if (!dialog) return;
    const focusableElements = () => Array.from(dialog.querySelectorAll<HTMLElement>(
      'button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
    ));
    (focusableElements()[0] ?? dialog).focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeSettings();
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
      if (event.shiftKey && (document.activeElement === first || !dialog.contains(document.activeElement))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (document.activeElement === last || !dialog.contains(document.activeElement))) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      settingsRestoreFocusRef.current?.focus();
      settingsRestoreFocusRef.current = null;
    };
  }, [closeSettings, isSettingsOpen]);

  useEffect(() => {
    const openSearch = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setIsSearchOpen(true);
      }
    };
    window.addEventListener('keydown', openSearch);
    return () => window.removeEventListener('keydown', openSearch);
  }, []);

  const gradeCurrentReview = async (grade: 'forgot' | 'hard' | 'familiar' | 'mastered') => {
    if (gradeInFlightRef.current) return;
    const current = reviewQueue[0];
    if (!current) return;
    gradeInFlightRef.current = true;
    setIsGrading(true);
    setGradeError(null);
    setFailedGrade(null);
    try {
      await completeReview(current.id, grade, localCalendarDate());
      setReviewQueue((currentQueue) => (
        currentQueue[0]?.id === current.id ? currentQueue.slice(1) : currentQueue
      ));
      refreshOverview();
    } catch {
      setFailedGrade(grade);
      setGradeError('评分没有保存，当前题目仍在这里。请重试。');
    } finally {
      gradeInFlightRef.current = false;
      setIsGrading(false);
    }
  };

  const ingestProblemFiles = async () => {
    setIsIngesting(true);
    try {
      const results = await selectProblemFiles(selectedCourseId);
      if (!results.some((result) => result.item)) return;
      refreshOverview();
      setSelectedProblemId(null);
      setWorkspace('inbox');
    } catch {
      // Native dialog and import errors remain local to the initiating action.
    } finally {
      setIsIngesting(false);
    }
  };

  const importMaterialIntoCourse = async (courseId: string, path: string) => {
    setMaterialImportError(null);
    try {
      await importCourseMaterialFile(courseId, path);
      setSelectedCourseId(courseId);
      refreshOverview();
    } catch {
      setMaterialImportError('学习资料没有导入成功。请稍后重试；原文件没有被修改。');
    }
  };

  const requestMaterialImport = async () => {
    setMaterialImportError(null);
    pendingMaterialPathRef.current = null;
    const selectedCourseAtRequest = selectedCourseId;
    let path: string | null;
    try {
      path = await selectCourseMaterialFile();
    } catch {
      pendingMaterialPathRef.current = null;
      setMaterialImportError('无法打开学习资料选择窗口，请稍后重试。');
      return;
    }
    if (!path) {
      pendingMaterialPathRef.current = null;
      return;
    }
    if (selectedCourseAtRequest) {
      await importMaterialIntoCourse(selectedCourseAtRequest, path);
      return;
    }
    pendingMaterialPathRef.current = path;
    setCourseCreateRequestToken((token) => token + 1);
  };

  const requestCourseCreation = () => {
    setCourseCreateRequestToken((token) => token + 1);
  };

  const handleCourseCreated = (course: Course) => {
    refreshOverview();
    const pendingPath = pendingMaterialPathRef.current;
    pendingMaterialPathRef.current = null;
    if (pendingPath) void importMaterialIntoCourse(course.id, pendingPath);
  };

  const cancelCourseCreation = () => {
    pendingMaterialPathRef.current = null;
  };

  const exportBook = async (kind: BookKind) => {
    setExportingBook(kind);
    setExportStatus(null);
    try {
      const result = await saveProblemBook(kind);
      if (!result.cancelled) setExportStatus(`已导出 ${result.problemCount} 道题目。`);
    } catch {
      setExportStatus('导出没有完成。请确认目标文件没有被其他程序占用后重试。');
    } finally {
      setExportingBook(null);
    }
  };

  const backUpLibrary = async () => {
    setIsBackingUp(true);
    try {
      if (await createBackup()) setExportStatus('本地备份已创建。');
    } catch {
      setExportStatus('备份没有完成。请确认目标文件名尚未存在后重试。');
    } finally {
      setIsBackingUp(false);
    }
  };

  const restoreLibrary = async () => {
    setIsRestoring(true);
    setExportStatus(null);
    try {
      const result = await restoreBackup();
      if (result.restored) {
        setExportStatus('资料库已恢复，当前版本已自动保存；正在重新载入。');
        window.setTimeout(() => window.location.reload(), 800);
      }
    } catch {
      setExportStatus('恢复没有完成；当前资料库保持不变。请确认备份来自错题智库后重试。');
    } finally {
      setIsRestoring(false);
    }
  };

  useGSAP(() => {
    if (getMotionPreferences().reduceMotion || !contentRef.current) return;
    gsap.fromTo(contentRef.current, { opacity: 0, y: 5 }, { opacity: 1, y: 0, duration: 0.3, ease: 'power3.out', clearProps: 'transform' });
  }, { dependencies: [workspace, selectedProblemId], revertOnUpdate: true, scope: contentRef });

  const openProblem = (problemId: string) => {
    setMaterialInitialQuery('');
    setSelectedProblemId(problemId);
  };

  const selectWorkspace = (nextWorkspace: Workspace) => {
    setMaterialInitialQuery('');
    setSelectedProblemId(null);
    setWorkspace(nextWorkspace);
  };

  const openCourse = (courseId: string) => {
    setSelectedCourseId(courseId);
    setMaterialInitialQuery('');
    setSelectedProblemId(null);
    setWorkspace('archive');
  };

  const openMaterial = (courseId: string, query: string) => {
    setSelectedCourseId(courseId);
    setMaterialInitialQuery(query);
    setSelectedProblemId(null);
    setWorkspace('archive');
  };

  return (
    <main aria-label="错题智库" className="app-shell" role="application">
      <GlobalFileDrop
        courseId={selectedCourseId}
        onImported={refreshOverview}
        onOpenInbox={() => selectWorkspace('inbox')}
      />
      <DynamicControlSurface as="aside" className="sidebar">
        <div className="brand-lockup">
          <span aria-hidden="true"><BookOpenCheck size={15} strokeWidth={2.2} /></span>
          <strong>错题智库</strong>
        </div>

        <nav
          aria-label="资料库导航"
          className={`library-nav${activeNavIndex === null ? ' has-no-selection' : ''}`}
          style={{ '--nav-index': activeNavIndex ?? 0 } as CSSProperties}
        >
          <span aria-hidden="true" className="nav-selection-lens" />
          <button aria-current={workspace === 'overview' && !selectedProblemId ? 'page' : undefined} className={`nav-item ${workspace === 'overview' && !selectedProblemId ? 'is-active' : ''}`} onClick={() => selectWorkspace('overview')} type="button">
            <span><LayoutDashboard aria-hidden="true" size={16} />学习总览</span>
          </button>
          <button aria-current={workspace === 'inbox' && !selectedProblemId ? 'page' : undefined} className={`nav-item ${workspace === 'inbox' && !selectedProblemId ? 'is-active' : ''}`} onClick={() => selectWorkspace('inbox')} type="button">
            <span><Inbox aria-hidden="true" size={16} />待整理</span><em>本地</em>
          </button>
          <button aria-current={workspace === 'review' ? 'page' : undefined} className={`nav-item ${workspace === 'review' ? 'is-active' : ''}`} onClick={() => selectWorkspace('review')} type="button">
            <span><BookOpenCheck aria-hidden="true" size={16} />今日复习</span>
          </button>
          <button aria-current={workspace === 'archive' ? 'page' : undefined} className={`nav-item ${workspace === 'archive' ? 'is-active' : ''}`} onClick={() => selectWorkspace('archive')} type="button">
            <span><Archive aria-hidden="true" size={16} />全部档案</span>
          </button>
        </nav>

        <div className="sidebar-section"><CourseSidebar onCancelCourseCreate={cancelCourseCreation} onCourseCreated={handleCourseCreated} onSelectCourse={setSelectedCourseId} openCreateToken={courseCreateRequestToken} selectedCourseId={selectedCourseId} /></div>
        <p className="local-note"><ShieldCheck aria-hidden="true" size={13} />仅存储在这台电脑</p>
      </DynamicControlSurface>

      <section className="workbench" id={workspace}>
        <DynamicControlSurface as="header" className="toolbar">
          <div>
            <p className="eyebrow">{activeTitle.eyebrow}</p>
            <h1>{activeTitle.title}</h1>
            {workspace === 'overview' && !selectedProblemId ? <p className="toolbar-greeting">{timeGreeting()}</p> : null}
          </div>
          <div aria-label="工具" className="toolbar-actions">
            <button aria-label="投进题目" className="toolbar-button toolbar-ingest-action" disabled={isIngesting} onClick={() => void ingestProblemFiles()} type="button"><Upload aria-hidden="true" size={16} /><span>{isIngesting ? '正在导入…' : '投进题目'}</span></button>
            <button aria-label="全局搜索" className="toolbar-button icon-button" onClick={() => setIsSearchOpen(true)} ref={searchTriggerRef} type="button"><Search aria-hidden="true" size={17} /></button>
            <button aria-label="设置" className="toolbar-button icon-button" onClick={openSettings} ref={settingsTriggerRef} type="button"><Settings aria-hidden="true" size={17} /></button>
          </div>
        </DynamicControlSurface>

        <div ref={contentRef}>
          {selectedProblemId ? (
            <div className="document-stage">
              <button className="back-to-inbox" onClick={() => setSelectedProblemId(null)} type="button"><ChevronLeft aria-hidden="true" size={17} />{problemBackLabel}</button>
              <ProblemDocument onSaved={refreshOverview} problemId={selectedProblemId} />
            </div>
          ) : workspace === 'overview' ? (
            <div className="dashboard-stage">
              <LearningDashboard
                onCreateCourse={requestCourseCreation}
                onIngest={() => void ingestProblemFiles()}
                onImportMaterial={() => void requestMaterialImport()}
                onOpenCourse={openCourse}
                onOpenInbox={() => selectWorkspace('inbox')}
                onOpenProblem={openProblem}
                onOverviewLoaded={rememberOverview}
                onStartReview={() => selectWorkspace('review')}
                refreshToken={refreshToken}
              />
              {materialImportError ? <p className="material-import-error" role="alert">{materialImportError}</p> : null}
            </div>
          ) : workspace === 'inbox' ? (
            <div className="inbox-stage">
              <IngestDropzone courseId={selectedCourseId} onImported={refreshOverview} onOpenProblem={openProblem} />
              <section className="reading-note" aria-label="整理提示">
                <p className="eyebrow">一个安心的流程</p>
                <h2>先收题，后整理。</h2>
                <ol>
                  <li><span>1</span>原件立即安全保存</li>
                  <li><span>2</span>补充题干与个人作答</li>
                  <li><span>3</span>按需审阅 AI 建议</li>
                </ol>
              </section>
            </div>
          ) : workspace === 'review' && reviewLoadError ? (
            <section aria-label="复习队列读取失败" className="focus-empty review-load-error" role="alert">
              <div className="focus-empty-icon"><AlertCircle aria-hidden="true" size={24} /></div>
              <h2>复习队列暂时无法读取</h2>
              <p>本地资料库没有返回复习题目。你的记录没有改变。</p>
              <button onClick={() => void loadReviewQueue()} type="button"><RefreshCw aria-hidden="true" size={15} />重新读取复习队列</button>
            </section>
          ) : workspace === 'review' && reviewQueue[0] ? (
            <ReviewReader
              explanation={reviewQueue[0].explanation}
              gradeError={gradeError}
              isGrading={isGrading}
              onGrade={(grade) => void gradeCurrentReview(grade)}
              onRetry={failedGrade ? () => void gradeCurrentReview(failedGrade) : undefined}
              ownAnswer={reviewQueue[0].ownAnswer}
              standardAnswer={reviewQueue[0].standardAnswer}
              stem={reviewQueue[0].stem}
            />
          ) : workspace === 'review' ? (
            <section className="focus-empty" aria-label="复习队列">
              <div className="focus-empty-icon"><BookOpenCheck aria-hidden="true" size={24} /></div>
              <h2>{isReviewLoading ? '正在准备复习题目' : '今天没有待复习内容'}</h2>
              <p>{isReviewLoading ? '正在从本地资料库读取到期题目。' : '完成题目整理后，它会以专注阅读页的方式出现在这里。'}</p>
            </section>
          ) : (
            <ArchiveLibrary
              courseId={selectedCourseId}
              initialQuery={materialInitialQuery}
              onOpenProblem={openProblem}
              onSaved={refreshOverview}
            />
          )}
        </div>

        <CommandPalette
          onClose={closeSearch}
          onOpenCourse={openCourse}
          onOpenMaterial={openMaterial}
          onOpenProblem={openProblem}
          open={isSearchOpen}
          recentProblems={recentProblems}
        />

        {isSettingsOpen ? (
          <div className="inspector-backdrop">
            <InspectorSurface>
              <section aria-labelledby="preferences-title" aria-modal="true" className="preferences-inspector" ref={settingsDialogRef} role="dialog" tabIndex={-1}>
                <header className="preferences-header">
                  <div>
                    <p className="eyebrow">错题智库</p>
                    <h2 id="preferences-title">偏好设置</h2>
                  </div>
                  <button aria-label="关闭设置" className="inspector-close" onClick={closeSettings} type="button"><X aria-hidden="true" size={17} /></button>
                </header>
                <div className="preference-row">
                  <div><strong>本地资料库</strong><span>题目、附件和记录只保存在此设备。</span></div>
                  <span className="preference-status">已启用</span>
                </div>
                <div className="preference-row preference-ai"><AiSettings /></div>
                <div className="preference-row preference-export">
                  <div><strong>导出本地题册</strong><span>选择位置后生成 Markdown；题目册不会包含标准答案。</span></div>
                  <div className="export-actions">
                    <button disabled={exportingBook !== null} onClick={() => void exportBook('questions')} type="button">{exportingBook === 'questions' ? '正在导出…' : '导出题目册'}</button>
                    <button disabled={exportingBook !== null} onClick={() => void exportBook('answers')} type="button">{exportingBook === 'answers' ? '正在导出…' : '导出答案解析册'}</button>
                  </div>
                </div>
                <div className="preference-row preference-export">
                  <div><strong>本地资料库备份</strong><span>生成 SQLite 一致性快照；恢复前会另行确认，不会静默覆盖当前资料。</span></div>
                  <div className="export-actions">
                    <button disabled={isBackingUp || isRestoring} onClick={() => void backUpLibrary()} type="button">{isBackingUp ? '正在备份…' : '创建备份'}</button>
                    <button disabled={isBackingUp || isRestoring} onClick={() => void restoreLibrary()} type="button">{isRestoring ? '正在验证…' : '从备份恢复'}</button>
                  </div>
                </div>
                {exportStatus ? <p aria-live="polite" className="export-status">{exportStatus}</p> : null}
                <p className="preferences-note">此处不会自动上传教材、题目或个人作答。</p>
              </section>
            </InspectorSurface>
          </div>
        ) : null}
      </section>
    </main>
  );
}
