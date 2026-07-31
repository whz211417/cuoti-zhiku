import { AlertCircle, RefreshCw } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { getDashboardOverview, type DashboardOverview } from '../../lib/tauri';
import { CourseShelf } from './CourseShelf';
import { LearningSignals } from './LearningSignals';
import { RecentProblems } from './RecentProblems';
import { TodayFocus } from './TodayFocus';

type LearningDashboardProps = {
  refreshToken?: number;
  onIngest: () => void;
  onOpenCourse: (id: string) => void;
  onOpenInbox: () => void;
  onOpenProblem: (id: string) => void;
  onStartReview: () => void;
};

function localToday(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function DashboardSkeleton() {
  return (
    <div aria-label="正在读取学习总览" className="dashboard-skeleton" role="status">
      <div className="dashboard-skeleton-focus" data-skeleton-shape="focus" />
      <div className="dashboard-skeleton-shelf" data-skeleton-shape="shelf" />
      <div className="dashboard-skeleton-list" data-skeleton-shape="list" />
      <div className="dashboard-skeleton-signals" data-skeleton-shape="signals" />
    </div>
  );
}

export function LearningDashboard({
  onIngest,
  onOpenCourse,
  onOpenInbox,
  onOpenProblem,
  onStartReview,
  refreshToken,
}: LearningDashboardProps) {
  const [overview, setOverview] = useState<DashboardOverview | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(false);
  const activeRequest = useRef(0);

  const load = useCallback(async () => {
    const request = activeRequest.current + 1;
    activeRequest.current = request;
    setIsLoading(true);
    setError(false);
    try {
      const nextOverview = await getDashboardOverview(localToday());
      if (activeRequest.current === request) setOverview(nextOverview);
    } catch {
      if (activeRequest.current === request) setError(true);
    } finally {
      if (activeRequest.current === request) setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    return () => {
      activeRequest.current += 1;
    };
  }, [load, refreshToken]);

  return (
    <section
      aria-busy={isLoading}
      aria-label="学习总览"
      className="learning-dashboard"
    >
      {!overview && isLoading ? <DashboardSkeleton /> : null}
      {!overview && error ? (
        <div className="dashboard-error" role="alert">
          <AlertCircle aria-hidden="true" size={20} />
          <div>
            <p>学习总览暂时无法读取。</p>
            <button className="dashboard-retry" onClick={() => void load()} type="button">
              <RefreshCw aria-hidden="true" size={15} />
              重新读取
            </button>
          </div>
        </div>
      ) : null}
      {overview ? (
        <div className="dashboard-content">
          {error ? <p className="dashboard-refresh-error" role="status">最新数据暂时无法读取，仍显示上次结果。</p> : null}
          <TodayFocus
            onIngest={onIngest}
            onOpenInbox={onOpenInbox}
            onStartReview={onStartReview}
            overview={overview}
          />
          <CourseShelf courses={overview.courseSummaries} onOpenCourse={onOpenCourse} />
          <RecentProblems onOpenProblem={onOpenProblem} problems={overview.recentProblems} />
          <LearningSignals
            activity={overview.activityLastSevenDays}
            knowledgeTopics={overview.topKnowledgeTopics}
            mistakeReasons={overview.topMistakeReasons}
          />
        </div>
      ) : null}
    </section>
  );
}
