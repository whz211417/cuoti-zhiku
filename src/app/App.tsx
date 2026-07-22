import { IngestDropzone } from '../features/inbox/IngestDropzone';

export function App() {
  return (
    <main aria-label="错题智库" className="app-shell" role="application">
      <aside className="sidebar">
        <div className="brand-lockup"><span>错</span><strong>错题智库</strong></div>
        <nav aria-label="资料库导航" className="library-nav">
          <a className="nav-item is-active" href="#inbox"><span>收件箱</span><em>0</em></a>
          <a className="nav-item" href="#review"><span>今日复习</span><em>0</em></a>
          <a className="nav-item" href="#archive"><span>全部档案</span></a>
        </nav>
        <div className="sidebar-section">
          <p className="sidebar-label">课程</p>
          <button className="course-row" type="button"><i className="course-dot course-dot-econ" />宏观经济学</button>
          <button className="course-row" type="button"><i className="course-dot course-dot-micro" />微观经济学</button>
          <button className="add-course" type="button">＋ 新建课程</button>
        </div>
        <p className="local-note">仅存储在这台电脑上</p>
      </aside>
      <section className="workbench" id="inbox">
        <header className="toolbar">
          <div>
            <p className="eyebrow">本地资料库</p>
            <h1>收件箱</h1>
          </div>
          <div className="toolbar-actions">
            <button aria-label="搜索题目" className="toolbar-button" type="button">⌕</button>
            <button className="toolbar-button" type="button">设置</button>
          </div>
        </header>
        <div className="inbox-stage">
          <IngestDropzone />
          <section className="reading-note" aria-label="整理提示">
            <p className="eyebrow">一个安心的流程</p>
            <h2>先收题，后整理。</h2>
            <ol>
              <li><span>1</span>原件立即保存</li>
              <li><span>2</span>补充题干或个人作答</li>
              <li><span>3</span>需要时再请求 AI 建议</li>
            </ol>
          </section>
        </div>
      </section>
    </main>
  );
}
