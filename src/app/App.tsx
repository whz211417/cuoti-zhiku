import { useGSAP } from '@gsap/react';
import { gsap } from 'gsap';
import { AlertCircle, Archive, BookOpenCheck, ChevronLeft, Inbox, LayoutDashboard, Network, RefreshCw, Search, Settings, ShieldCheck, Upload, X } from 'lucide-react';
import { type CSSProperties, useCallback, useEffect, useRef, useState } from 'react';
import { DynamicControlSurface } from '../components/material/DynamicControlSurface';
import { InspectorSurface } from '../components/material/InspectorSurface';
import { createBackup } from '../features/backup/createBackup';
import { restoreBackup } from '../features/backup/restoreBackup';
import { ArchiveLibrary } from '../features/archive/ArchiveLibrary';
import { CourseSidebar } from '../features/courses/CourseSidebar';
import { LearningDashboard } from '../features/dashboard/LearningDashboard';
import { saveProblemBook, type BookFormat, type BookKind } from '../features/export/exportBooks';
import { ClipboardImageCapture } from '../features/ingest/ClipboardImageCapture';
import { GlobalFileDrop } from '../features/ingest/GlobalFileDrop';
import { IngestDropzone } from '../features/inbox/IngestDropzone';
import { selectProblemFiles } from '../features/inbox/selectProblemFiles';
import { KnowledgeNetwork } from '../features/knowledge/KnowledgeNetwork';
import { selectCourseMaterialFile } from '../features/materials/selectCourseMaterialFile';
import { ProblemDocument } from '../features/problems/ProblemDocument';
import { ReviewReader } from '../features/review/ReviewReader';
import { CommandPalette } from '../features/search/CommandPalette';
import { AiProviderSettings } from '../features/settings/AiProviderSettings';
import { ObsidianSettings } from '../features/settings/ObsidianSettings';
import { localCalendarDate, timeGreeting } from '../lib/dates';
import { getMotionPreferences } from '../lib/preferences';
import { completeReview, getDueReviewProblems, importCourseMaterialFile, type Course, type DashboardOverview, type RecentProblem, type ReviewProblem } from '../lib/tauri';

type Workspace = 'overview' | 'inbox' | 'review' | 'knowledge' | 'archive';
type ReviewGrade = 'forgot' | 'hard' | 'familiar' | 'mastered';
type ReviewSession = {
  initialCount: number;
  completed: number;
  grades: Record<ReviewGrade, number>;
  nextReviewOn: string | null;
};

const emptyReviewSession = (initialCount: number): ReviewSession => ({
  initialCount,
  completed: 0,
  grades: { forgot: 0, hard: 0, familiar: 0, mastered: 0 },
  nextReviewOn: null,
});

const workspaceTitles: Record<Workspace, { eyebrow: string; title: string }> = {
  overview: { eyebrow: '学习节奏', title: '学习总览' },
  inbox: { eyebrow: '本地资料库', title: '待整理' },
  review: { eyebrow: '专注复习', title: '今日复习' },
  knowledge: { eyebrow: '课程关系', title: '知识网络' },
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
  const [reviewSession, setReviewSession] = useState<ReviewSession | null>(null);
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
  const materialPickerRequestRef = useRef(0);
  const reviewRequestRef = useRef(0);
  const activeTitle = selectedProblemId ? { eyebrow: '本地资料库', title: '题目档案' } : workspaceTitles[workspace];
  const problemBackLabel = workspace === 'archive'
    ? '返回全部档案'
    : workspace === 'knowledge'
      ? '返回知识网络'
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
          : workspace === 'knowledge'
            ? 3
            : 4;

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
    setReviewSession(null);
    const today = localCalendarDate();
    try {
      const queue = await getDueReviewProblems(today);
      if (reviewRequestRef.current === request) {
        setReviewQueue(queue);
        setReviewSession(emptyReviewSession(queue.length));
      }
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

  const gradeCurrentReview = async (grade: ReviewGrade) => {
    if (gradeInFlightRef.current) return;
    const current = reviewQueue[0];
    if (!current) return;
    gradeInFlightRef.current = true;
    setIsGrading(true);
    setGradeError(null);
    setFailedGrade(null);
    try {
      const schedule = await completeReview(current.id, grade, localCalendarDate());
      setReviewQueue((currentQueue) => (
        currentQueue[0]?.id === current.id ? currentQueue.slice(1) : currentQueue
      ));
      setReviewSession((session) => {
        const currentSession = session ?? emptyReviewSession(reviewQueue.length);
        const nextReviewOn = schedule?.nextReviewOn;
        return {
          ...currentSession,
          completed: currentSession.completed + 1,
          grades: { ...currentSession.grades, [grade]: currentSession.grades[grade] + 1 },
          nextReviewOn: nextReviewOn && (!currentSession.nextReviewOn || nextReviewOn < currentSession.nextReviewOn)
            ? nextReviewOn
            : currentSession.nextReviewOn,
        };
      });
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
    const request = materialPickerRequestRef.current + 1;
    materialPickerRequestRef.current = request;
    pendingMaterialPathRef.current = null;
    const selectedCourseAtRequest = selectedCourseId;
    let path: string | null;
    try {
      path = await selectCourseMaterialFile();
    } catch {
      if (materialPickerRequestRef.current !== request) return;
      pendingMaterialPathRef.current = null;
      setMaterialImportError('无法打开学习资料选择窗口，请稍后重试。');
      return;
    }
    if (materialPickerRequestRef.current !== request) return;
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

  const exportBook = async (kind: BookKind, format: BookFormat = 'markdown') => {
    setExportingBook(kind);
    setExportStatus(null);
    try {
      const result = format === 'markdown'
        ? await saveProblemBook(kind)
        : await saveProblemBook(kind, format);
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
      const result = await createBackup();
      if (result) setExportStatus(`完整备份已创建，已收录 ${result.originalCount} 份原件。`);
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
      <ClipboardImageCapture
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
          <button aria-current={workspace === 'knowledge' ? 'page' : undefined} className={`nav-item ${workspace === 'knowledge' ? 'is-active' : ''}`} onClick={() => selectWorkspace('knowledge')} type="button">
            <span><Network aria-hidden="true" size={16} />知识网络</span>
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
              <ProblemDocument onOpenAiSettings={openSettings} onOrganized={refreshOverview} onSaved={refreshOverview} problemId={selectedProblemId} />
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
              position={reviewSession ? reviewSession.completed + 1 : undefined}
              standardAnswer={reviewQueue[0].standardAnswer}
              stem={reviewQueue[0].stem}
              total={reviewSession?.initialCount}
            />
          ) : workspace === 'review' && !isReviewLoading && reviewSession && reviewSession.completed > 0 ? (
            <section className="review-summary" aria-label="本次复习总结">
              <div className="review-summary__mark"><ShieldCheck aria-hidden="true" size={27} /></div>
              <p className="eyebrow">本次复习已保存 · {reviewSession.completed}/{reviewSession.initialCount}</p>
              <h2>完成 {reviewSession.completed} 道，今天收得很好。</h2>
              <div className="review-summary__stats" aria-label="评分分布">
                <span><strong>{reviewSession.grades.forgot}</strong><small>忘记</small></span>
                <span><strong>{reviewSession.grades.hard}</strong><small>困难</small></span>
                <span><strong>{reviewSession.grades.familiar}</strong><small>熟悉</small></span>
                <span><strong>{reviewSession.grades.mastered}</strong><small>掌握</small></span>
              </div>
              <p>{reviewSession.nextReviewOn ? `最早下一次复习：${reviewSession.nextReviewOn}` : '新的复习日期已写入本地资料库。'}</p>
              <div className="review-summary__actions">
                <button onClick={() => selectWorkspace('overview')} type="button">返回学习总览</button>
                <button onClick={() => selectWorkspace('knowledge')} type="button">查看知识网络</button>
              </div>
            </section>
          ) : workspace === 'review' ? (
            <section className="focus-empty" aria-label="复习队列">
              <div className="focus-empty-icon"><BookOpenCheck aria-hidden="true" size={24} /></div>
              <h2>{isReviewLoading ? '正在准备复习题目' : '今天没有待复习内容'}</h2>
              <p>{isReviewLoading ? '正在从本地资料库读取到期题目。' : '完成题目整理后，它会以专注阅读页的方式出现在这里。'}</p>
            </section>
          ) : workspace === 'knowledge' ? (
            <KnowledgeNetwork courseId={selectedCourseId} onOpenProblem={openProblem} refreshToken={refreshToken} />
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
                <div className="preference-row preference-ai"><AiProviderSettings /></div>
                <div className="preference-row preference-export">
                  <div><strong>导出本地题册</strong><span>Markdown 便于继续编辑；打印版针对 A4 排版，可直接保存 PDF。题目册绝不包含标准答案。</span></div>
                  <div className="export-actions">
                    <button aria-label="导出题目册" disabled={exportingBook !== null} onClick={() => void exportBook('questions')} type="button">{exportingBook === 'questions' ? '正在导出…' : '题目 · Markdown'}</button>
                    <button aria-label="导出答案解析册" disabled={exportingBook !== null} onClick={() => void exportBook('answers')} type="button">{exportingBook === 'answers' ? '正在导出…' : '解析 · Markdown'}</button>
                    <button aria-label="导出可打印题目册" disabled={exportingBook !== null} onClick={() => void exportBook('questions', 'print')} type="button">题目 · 打印版</button>
                    <button aria-label="导出可打印答案解析册" disabled={exportingBook !== null} onClick={() => void exportBook('answers', 'print')} type="button">解析 · 打印版</button>
                  </div>
                </div>
                <div className="preference-row preference-obsidian"><ObsidianSettings courseId={selectedCourseId} /></div>
                <div className="preference-row preference-export">
                  <div><strong>完整本地备份</strong><span>单文件保存题目、课程、复习记录和全部原件，并逐项校验；仍可恢复旧 SQLite 快照。</span></div>
                  <div className="export-actions">
                    <button disabled={isBackingUp || isRestoring} onClick={() => void backUpLibrary()} type="button">{isBackingUp ? '正在备份…' : '创建备份'}</button>
                    <button disabled={isBackingUp || isRestoring} onClick={() => void restoreLibrary()} type="button">{isRestoring ? '正在验证…' : '从备份恢复'}</button>
                  </div>
                </div>
                {exportStatus ? <p aria-live="polite" className="export-status">{exportStatus}</p> : null}
                <p className="preferences-note">此处不会自动上传教材、题目或个人作答。</p>
              </section>
          </InspectorSurface>
        ) : null}
      </section>
    </main>
  );
}
