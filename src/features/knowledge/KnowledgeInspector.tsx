import { BookOpen, CalendarClock, ChevronRight, TriangleAlert } from 'lucide-react';
import type { KnowledgeProblem, KnowledgeTopic } from '../../lib/tauri';

type KnowledgeInspectorProps = {
  topic: KnowledgeTopic | null;
  problems: KnowledgeProblem[];
  onOpenProblem: (problemId: string) => void;
};

export function KnowledgeInspector({ topic, problems, onOpenProblem }: KnowledgeInspectorProps) {
  if (!topic) {
    return (
      <aside aria-label="知识点摘要" className="knowledge-inspector is-idle">
        <BookOpen aria-hidden="true" size={23} strokeWidth={1.65} />
        <h2>选中一个知识点</h2>
        <p>这里会汇总关联错题、常见错因和本地复习状态。</p>
      </aside>
    );
  }

  return (
    <aside aria-label="知识点摘要" className="knowledge-inspector">
      <header>
        <p>知识点摘要</p>
        <h2>{topic.name}</h2>
      </header>
      <div className="knowledge-score-row">
        <div><strong>{topic.masteryScore}</strong><span>掌握度</span></div>
        <div><strong>{topic.problemCount}</strong><span>道关联题</span></div>
        <div><strong>{topic.dueCount}</strong><span>道待复习</span></div>
      </div>
      <p className="knowledge-inspector-note">
        <CalendarClock aria-hidden="true" size={15} />
        {topic.lastReviewedAt ? `最近复习 ${topic.lastReviewedAt}` : '尚未留下复习记录'}
      </p>
      <section>
        <h3><TriangleAlert aria-hidden="true" size={15} />常见错因</h3>
        {topic.mistakeReasons.length ? (
          <div className="knowledge-reasons">{topic.mistakeReasons.map((reason) => <span key={reason}>{reason}</span>)}</div>
        ) : <p className="knowledge-empty-copy">关联题目还没有记录错因。</p>}
      </section>
      <section>
        <h3><BookOpen aria-hidden="true" size={15} />关联题目</h3>
        <div className="knowledge-problem-list">
          {problems.map((problem) => (
            <button aria-label={`打开题目：${problem.title}`} key={problem.id} onClick={() => onOpenProblem(problem.id)} type="button">
              <span><strong>{problem.title}</strong><small>{problem.due ? '已到复习时间' : '已收进档案'}</small></span>
              <ChevronRight aria-hidden="true" size={16} />
            </button>
          ))}
        </div>
      </section>
    </aside>
  );
}
