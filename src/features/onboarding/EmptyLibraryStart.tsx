import { BookOpenCheck, FilePlus2, FolderUp } from 'lucide-react';

export function EmptyLibraryStart({
  onCreateCourse,
  onImportMaterial,
  onImportProblem,
}: {
  onCreateCourse: () => void;
  onImportMaterial: () => void;
  onImportProblem: () => void;
}) {
  return (
    <section aria-label="开始建立学习资料库" className="empty-library-start">
      <header className="empty-library-start__heading">
        <p className="eyebrow">从第一份记录开始</p>
        <h2>把学习资料留在一处，之后每次复习都会更轻松。</h2>
        <p>先保存一份题目、学习资料或课程。所有内容都只保存在这台电脑上。</p>
      </header>
      <div className="empty-library-start__actions">
        <button aria-label="拖入题目或题图" className="empty-library-start__primary" onClick={onImportProblem} type="button">
          <span aria-hidden="true" className="empty-library-start__mark"><FilePlus2 size={18} strokeWidth={1.8} /></span>
          <span><strong>拖入题目或题图</strong><small>图片、PDF 或文字题目会先安全保存</small></span>
        </button>
        <div className="empty-library-start__secondary-actions">
          <button aria-label="导入学习资料" onClick={onImportMaterial} type="button">
            <FolderUp aria-hidden="true" size={17} strokeWidth={1.8} />
            <span><strong>导入学习资料</strong><small>教材、讲义与 Markdown 资料</small></span>
          </button>
          <button aria-label="新建课程" onClick={onCreateCourse} type="button">
            <BookOpenCheck aria-hidden="true" size={17} strokeWidth={1.8} />
            <span><strong>新建课程</strong><small>按课程整理题目与资料</small></span>
          </button>
        </div>
      </div>
    </section>
  );
}
