import { Archive, ArrowRight, BookOpenCheck, Check, FileText, Inbox } from 'lucide-react';
import type { DashboardOverview } from '../../lib/tauri';

type TodayFocusProps = {
  overview: DashboardOverview;
  onIngest: () => void;
  onOpenInbox: () => void;
  onOpenProblem: (id: string) => void;
  onStartReview: () => void;
};

export type TodayPathStep = {
  detail: string;
  label: string;
  state: 'done' | 'ready' | 'waiting';
};

export type TodayAction = {
  kind: 'ingest' | 'inbox' | 'resume' | 'review';
  label: string;
  problemId?: string;
  title: string;
};

// eslint-disable-next-line react-refresh/only-export-components -- required public selector contract
export function buildTodayPath(overview: DashboardOverview): { action: TodayAction; steps: TodayPathStep[] } {
  const resumable = overview.recentProblems[0];
  if (overview.dueReviewCount > 0) {
    return {
      action: { title: `${overview.dueReviewCount} 道题等待复习`, label: '开始复习', kind: 'review' },
      steps: [
        { label: '先复习', detail: `${overview.dueReviewCount} 道待复习`, state: 'ready' },
        { label: '再整理', detail: overview.pendingInboxCount ? `${overview.pendingInboxCount} 道待整理` : '暂无待整理', state: overview.pendingInboxCount ? 'waiting' : 'done' },
        { label: '然后延续', detail: resumable ? '可继续上次题目' : '投进下一道题', state: 'waiting' },
      ],
    };
  }
  if (overview.pendingInboxCount > 0) {
    return {
      action: { title: `${overview.pendingInboxCount} 道题等待整理`, label: '继续整理', kind: 'inbox' },
      steps: [
        { label: '先复习', detail: '今天没有待复习', state: 'done' },
        { label: '再整理', detail: `${overview.pendingInboxCount} 道待整理`, state: 'ready' },
        { label: '然后延续', detail: resumable ? '可继续上次题目' : '投进下一道题', state: 'waiting' },
      ],
    };
  }
  if (resumable) {
    return {
      action: { title: '继续上次题目', label: '继续上次题目', kind: 'resume', problemId: resumable.id },
      steps: [
        { label: '先复习', detail: '今天没有待复习', state: 'done' },
        { label: '再整理', detail: '资料库已整理好', state: 'done' },
        { label: '然后延续', detail: '可继续上次题目', state: 'ready' },
      ],
    };
  }
  return {
    action: { title: '资料库已整理好', label: '投进题目', kind: 'ingest' },
    steps: [
      { label: '先复习', detail: '今天没有待复习', state: 'done' },
      { label: '再整理', detail: '资料库已整理好', state: 'done' },
      { label: '然后延续', detail: '投进第一道题', state: 'ready' },
    ],
  };
}

export function TodayFocus({ onIngest, onOpenInbox, onOpenProblem, onStartReview, overview }: TodayFocusProps) {
  const { action, steps } = buildTodayPath(overview);
  const runAction = action.kind === 'review'
    ? onStartReview
    : action.kind === 'inbox'
      ? onOpenInbox
      : action.kind === 'resume' && action.problemId
        ? () => onOpenProblem(action.problemId as string)
        : onIngest;

  const statistics = [
    { label: '待复习', value: overview.dueReviewCount, icon: BookOpenCheck },
    { label: '待整理', value: overview.pendingInboxCount, icon: Inbox },
    { label: '课程', value: overview.courseCount, icon: Archive },
    { label: '资料', value: overview.materialCount, icon: FileText },
  ];

  return (
    <section aria-labelledby="today-focus-title" className="dashboard-focus">
      <div className="dashboard-focus-copy">
        <p className="eyebrow">今日焦点</p>
        <h2 id="today-focus-title">{action.title}</h2>
        <p>从最值得处理的一步开始，保持资料库清楚、可复习。</p>
        <button className="primary-action dashboard-primary-action" onClick={runAction} type="button">
          {action.label}
        </button>
      </div>
      <ol aria-label="今日路径" className="dashboard-learning-path">
        {steps.map((step, index) => (
          <li className={`is-${step.state}`} key={step.label}>
            <span aria-hidden="true" className="dashboard-learning-path__step">
              {step.state === 'done' ? <Check size={13} strokeWidth={2.4} /> : <span>{index + 1}</span>}
            </span>
            <span><strong>{step.label}</strong><small>{step.detail}</small></span>
            {step.state === 'ready' ? <ArrowRight aria-hidden="true" size={14} /> : null}
          </li>
        ))}
      </ol>
      <dl aria-label="学习统计" className="dashboard-statistics">
        {statistics.map(({ icon: Icon, label, value }) => (
          <div className="dashboard-statistic" key={label}>
            <dt><Icon aria-hidden="true" size={15} />{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
