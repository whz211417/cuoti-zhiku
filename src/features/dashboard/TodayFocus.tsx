import { Archive, BookOpenCheck, FileText, Inbox } from 'lucide-react';
import type { DashboardOverview } from '../../lib/tauri';

type TodayFocusProps = {
  overview: DashboardOverview;
  onIngest: () => void;
  onOpenInbox: () => void;
  onStartReview: () => void;
};

// eslint-disable-next-line react-refresh/only-export-components -- required public selector contract
export function focusAction(overview: DashboardOverview) {
  if (overview.dueReviewCount > 0) {
    return { title: `${overview.dueReviewCount} 道题等待复习`, label: '开始复习', kind: 'review' as const };
  }
  if (overview.pendingInboxCount > 0) {
    return { title: `${overview.pendingInboxCount} 道题等待整理`, label: '继续整理', kind: 'inbox' as const };
  }
  return { title: '资料库已整理好', label: '投进题目', kind: 'ingest' as const };
}

export function TodayFocus({ onIngest, onOpenInbox, onStartReview, overview }: TodayFocusProps) {
  const action = focusAction(overview);
  const runAction = action.kind === 'review'
    ? onStartReview
    : action.kind === 'inbox'
      ? onOpenInbox
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
