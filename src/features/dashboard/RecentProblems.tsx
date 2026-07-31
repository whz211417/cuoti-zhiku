import { ArrowUpRight, FileQuestion } from 'lucide-react';
import type { RecentProblem } from '../../lib/tauri';

type RecentProblemsProps = {
  onOpenProblem: (id: string) => void;
  problems: RecentProblem[];
};

function problemTitle(problem: RecentProblem) {
  return problem.title || problem.fallbackFilename || '未命名题目';
}

function statusLabel(status: string) {
  if (status === 'organized') return '已整理';
  if (status === 'reviewing') return '复习中';
  return '待整理';
}

function updatedDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '时间待确认';
  return new Intl.DateTimeFormat('zh-CN', { month: 'numeric', day: 'numeric' }).format(date);
}

export function RecentProblems({ onOpenProblem, problems }: RecentProblemsProps) {
  const visibleProblems = problems.slice(0, 5);

  return (
    <section aria-labelledby="recent-problems-title" className="dashboard-section dashboard-recent-problems">
      <header className="dashboard-section-heading">
        <div>
          <p className="eyebrow">最近题目</p>
          <h2 id="recent-problems-title">接着上次的思路</h2>
        </div>
      </header>
      {visibleProblems.length > 0 ? (
        <ul className="dashboard-problem-list">
          {visibleProblems.map((problem) => {
            const title = problemTitle(problem);
            return (
              <li key={problem.id}>
                <button
                  aria-label={`打开 ${title}`}
                  className="dashboard-problem"
                  onClick={() => onOpenProblem(problem.id)}
                  type="button"
                >
                  <FileQuestion aria-hidden="true" size={17} />
                  <span className="dashboard-problem-copy">
                    <strong>{title}</strong>
                    <span>{problem.courseName || '未归类课程'} · {updatedDate(problem.updatedAt)}</span>
                  </span>
                  <span className="dashboard-problem-status">{statusLabel(problem.status)}</span>
                  <ArrowUpRight aria-hidden="true" size={15} />
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="dashboard-empty">还没有最近更新的题目。投进一道题后，就能从这里继续整理。</p>
      )}
    </section>
  );
}
