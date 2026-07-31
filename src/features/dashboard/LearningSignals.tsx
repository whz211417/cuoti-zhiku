import { Activity, Network, TriangleAlert } from 'lucide-react';
import type { ActivityDay, CountedSignal } from '../../lib/tauri';

type LearningSignalsProps = {
  activity: ActivityDay[];
  mistakeReasons: CountedSignal[];
  knowledgeTopics: CountedSignal[];
};

function chineseDate(value: string) {
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  if ([year, month, day].some(Number.isNaN) || Number.isNaN(date.getTime())) return value;
  const parts = new Intl.DateTimeFormat('zh-CN-u-nu-latn', {
    day: 'numeric',
    month: 'numeric',
  }).formatToParts(date);
  const localizedMonth = parts.find((part) => part.type === 'month')?.value;
  const localizedDay = parts.find((part) => part.type === 'day')?.value;
  return localizedMonth && localizedDay ? `${localizedMonth}月${localizedDay}日` : value;
}

function RankedSignals({
  empty,
  signals,
}: {
  empty: string;
  signals: CountedSignal[];
}) {
  if (signals.length === 0) return <p className="dashboard-empty dashboard-signal-empty">{empty}</p>;

  return (
    <ol className="dashboard-ranked-list">
      {signals.map((signal, index) => (
        <li key={signal.label}>
          <span aria-hidden="true">{index + 1}</span>
          <strong>{signal.label}</strong>
          <span>{signal.count} 次</span>
        </li>
      ))}
    </ol>
  );
}

export function LearningSignals({ activity, knowledgeTopics, mistakeReasons }: LearningSignalsProps) {
  const visibleActivity = activity.slice(-7);
  const hasActivity = visibleActivity.some((day) => day.count > 0);

  return (
    <section aria-labelledby="learning-signals-title" className="dashboard-section dashboard-learning-signals">
      <header className="dashboard-section-heading">
        <div>
          <p className="eyebrow">学习信号</p>
          <h2 id="learning-signals-title">看见反复出现的线索</h2>
        </div>
      </header>
      <div className="dashboard-signal-columns">
        <section aria-labelledby="mistake-signals-title" className="dashboard-signal-group">
          <h3 id="mistake-signals-title"><TriangleAlert aria-hidden="true" size={15} />常见错因</h3>
          <RankedSignals empty="记录错因后，这里会显示最常出现的薄弱环节。" signals={mistakeReasons} />
        </section>
        <section aria-labelledby="topic-signals-title" className="dashboard-signal-group">
          <h3 id="topic-signals-title"><Network aria-hidden="true" size={15} />知识点脉络</h3>
          <RankedSignals empty="整理知识点后，这里会逐步形成复习脉络。" signals={knowledgeTopics} />
        </section>
      </div>
      <section aria-labelledby="activity-strip-title" className="dashboard-activity">
        <h3 id="activity-strip-title"><Activity aria-hidden="true" size={15} />最近七天</h3>
        {visibleActivity.length > 0 ? (
          <ol aria-label="最近七天学习活动" className="dashboard-activity-strip">
            {visibleActivity.map((day) => {
              const date = chineseDate(day.date);
              return (
                <li aria-label={`${date}，${day.count}次活动`} key={day.date}>
                  <span aria-hidden="true" className="dashboard-activity-count">{day.count}</span>
                  <time aria-hidden="true" dateTime={day.date}>{date}</time>
                </li>
              );
            })}
          </ol>
        ) : null}
        {!hasActivity ? <p className="dashboard-empty dashboard-activity-empty">最近七天还没有学习活动，从投进一道题开始吧。</p> : null}
      </section>
    </section>
  );
}
