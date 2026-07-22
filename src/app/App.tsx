import { useGSAP } from '@gsap/react';
import { gsap } from 'gsap';
import { Archive, BookOpenCheck, ChevronLeft, Inbox, Search, Settings, ShieldCheck, X } from 'lucide-react';
import { useRef, useState } from 'react';
import { InspectorSurface } from '../components/material/InspectorSurface';
import { CourseSidebar } from '../features/courses/CourseSidebar';
import { IngestDropzone } from '../features/inbox/IngestDropzone';
import { ProblemDocument } from '../features/problems/ProblemDocument';
import { getMotionPreferences } from '../lib/preferences';

type Workspace = 'inbox' | 'review' | 'archive';

const workspaceTitles: Record<Workspace, { eyebrow: string; title: string }> = {
  inbox: { eyebrow: '本地资料库', title: '收件箱' },
  review: { eyebrow: '专注复习', title: '今日复习' },
  archive: { eyebrow: '个人档案', title: '全部档案' },
};

export function App() {
  const [selectedProblemId, setSelectedProblemId] = useState<string | null>(null);
  const [selectedCourseId, setSelectedCourseId] = useState<string | null>(null);
  const [workspace, setWorkspace] = useState<Workspace>('inbox');
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);
  const activeTitle = selectedProblemId ? { eyebrow: '本地资料库', title: '题目档案' } : workspaceTitles[workspace];

  useGSAP(() => {
    if (getMotionPreferences().reduceMotion || !contentRef.current) return;
    gsap.fromTo(contentRef.current, { opacity: 0, y: 5 }, { opacity: 1, y: 0, duration: 0.3, ease: 'power3.out', clearProps: 'transform' });
  }, { dependencies: [workspace, selectedProblemId], revertOnUpdate: true, scope: contentRef });

  const openProblem = (problemId: string) => {
    setWorkspace('inbox');
    setSelectedProblemId(problemId);
  };

  const selectWorkspace = (nextWorkspace: Workspace) => {
    setSelectedProblemId(null);
    setWorkspace(nextWorkspace);
  };

  return (
    <main aria-label="错题智库" className="app-shell" role="application">
      <aside className="sidebar">
        <div className="brand-lockup">
          <span aria-hidden="true"><BookOpenCheck size={15} strokeWidth={2.2} /></span>
          <strong>错题智库</strong>
        </div>

        <nav aria-label="资料库导航" className="library-nav">
          <button aria-current={workspace === 'inbox' && !selectedProblemId ? 'page' : undefined} className={`nav-item ${workspace === 'inbox' && !selectedProblemId ? 'is-active' : ''}`} onClick={() => selectWorkspace('inbox')} type="button">
            <span><Inbox aria-hidden="true" size={16} />收件箱</span><em>本地</em>
          </button>
          <button aria-current={workspace === 'review' ? 'page' : undefined} className={`nav-item ${workspace === 'review' ? 'is-active' : ''}`} onClick={() => selectWorkspace('review')} type="button">
            <span><BookOpenCheck aria-hidden="true" size={16} />今日复习</span>
          </button>
          <button aria-current={workspace === 'archive' ? 'page' : undefined} className={`nav-item ${workspace === 'archive' ? 'is-active' : ''}`} onClick={() => selectWorkspace('archive')} type="button">
            <span><Archive aria-hidden="true" size={16} />全部档案</span>
          </button>
        </nav>

        <div className="sidebar-section"><CourseSidebar onSelectCourse={setSelectedCourseId} selectedCourseId={selectedCourseId} /></div>
        <p className="local-note"><ShieldCheck aria-hidden="true" size={13} />仅存储在这台电脑</p>
      </aside>

      <section className="workbench" id={workspace}>
        <header className="toolbar">
          <div>
            <p className="eyebrow">{activeTitle.eyebrow}</p>
            <h1>{activeTitle.title}</h1>
          </div>
          <div aria-label="工具" className="toolbar-actions">
            <button aria-label="搜索题目" className="toolbar-button icon-button" type="button"><Search aria-hidden="true" size={17} /></button>
            <button aria-label="设置" className="toolbar-button icon-button" onClick={() => setIsSettingsOpen(true)} type="button"><Settings aria-hidden="true" size={17} /></button>
          </div>
        </header>

        <div ref={contentRef}>
          {selectedProblemId ? (
            <div className="document-stage">
              <button className="back-to-inbox" onClick={() => setSelectedProblemId(null)} type="button"><ChevronLeft aria-hidden="true" size={17} />返回收件箱</button>
              <ProblemDocument problemId={selectedProblemId} />
            </div>
          ) : workspace === 'inbox' ? (
            <div className="inbox-stage">
              <IngestDropzone courseId={selectedCourseId} onOpenProblem={openProblem} />
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
          ) : workspace === 'review' ? (
            <section className="focus-empty" aria-label="复习队列">
              <div className="focus-empty-icon"><BookOpenCheck aria-hidden="true" size={24} /></div>
              <h2>今天没有待复习内容</h2>
              <p>完成题目整理后，它会以专注阅读页的方式出现在这里。</p>
            </section>
          ) : (
            <section className="focus-empty" aria-label="题目档案">
              <div className="focus-empty-icon"><Archive aria-hidden="true" size={24} /></div>
              <h2>档案会在这里沉淀</h2>
              <p>从收件箱打开一条题目，补全内容后即可长期保存在本地资料库。</p>
            </section>
          )}
        </div>

        {isSettingsOpen ? (
          <div className="inspector-backdrop">
            <InspectorSurface>
              <section aria-labelledby="preferences-title" aria-modal="true" className="preferences-inspector" role="dialog">
                <header className="preferences-header">
                  <div>
                    <p className="eyebrow">错题智库</p>
                    <h2 id="preferences-title">偏好设置</h2>
                  </div>
                  <button aria-label="关闭设置" className="inspector-close" onClick={() => setIsSettingsOpen(false)} type="button"><X aria-hidden="true" size={17} /></button>
                </header>
                <div className="preference-row">
                  <div><strong>本地资料库</strong><span>题目、附件和记录只保存在此设备。</span></div>
                  <span className="preference-status">已启用</span>
                </div>
                <div className="preference-row">
                  <div><strong>AI 增强</strong><span>连接模型后，才会在你确认时处理少量相关内容。</span></div>
                  <span className="preference-status is-muted">未配置</span>
                </div>
                <p className="preferences-note">此处不会自动上传教材、题目或个人作答。</p>
              </section>
            </InspectorSurface>
          </div>
        ) : null}
      </section>
    </main>
  );
}
