import { AlertCircle, Network, RefreshCw } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { localCalendarDate } from '../../lib/dates';
import { getKnowledgeGraph, type KnowledgeGraph, type KnowledgeTopic } from '../../lib/tauri';
import { KnowledgeCanvas } from './KnowledgeCanvas';
import { KnowledgeInspector } from './KnowledgeInspector';

type KnowledgeFilter = 'all' | 'weak' | 'due';
type KnowledgeNetworkProps = {
  courseId: string | null;
  refreshToken: number;
  onOpenProblem: (problemId: string) => void;
};

const emptyGraph: KnowledgeGraph = { courses: [], topics: [], problems: [], edges: [] };

export function KnowledgeNetwork({ courseId, refreshToken, onOpenProblem }: KnowledgeNetworkProps) {
  const [graph, setGraph] = useState<KnowledgeGraph>(emptyGraph);
  const [filter, setFilter] = useState<KnowledgeFilter>('all');
  const [selectedTopicId, setSelectedTopicId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const requestRef = useRef(0);

  const load = useCallback(async () => {
    const request = requestRef.current + 1;
    requestRef.current = request;
    setLoading(true);
    setError(false);
    try {
      const nextGraph = await getKnowledgeGraph(courseId, localCalendarDate());
      if (requestRef.current !== request) return;
      setGraph(nextGraph);
      setSelectedTopicId((current) => nextGraph.topics.some((topic) => topic.id === current) ? current : null);
    } catch {
      if (requestRef.current === request) setError(true);
    } finally {
      if (requestRef.current === request) setLoading(false);
    }
  }, [courseId]);

  useEffect(() => {
    void load();
    return () => { requestRef.current += 1; };
  }, [load, refreshToken]);

  const visibleGraph = useMemo(() => {
    const topics = graph.topics.filter((topic) => filter === 'all' || (filter === 'weak' ? topic.masteryScore < 60 : topic.dueCount > 0));
    const courseIds = new Set(topics.map((topic) => topic.courseId));
    return { ...graph, courses: graph.courses.filter((course) => courseIds.has(course.id)), topics };
  }, [filter, graph]);
  const selectedTopic = graph.topics.find((topic) => topic.id === selectedTopicId) ?? null;
  const relatedProblems = selectedTopic ? graph.problems.filter((problem) => selectedTopic.problemIds.includes(problem.id)) : [];

  if (error) {
    return (
      <section aria-label="知识网络" className="knowledge-state" role="alert">
        <AlertCircle aria-hidden="true" size={25} />
        <h2>知识网络暂时无法读取</h2>
        <p>本地题目没有改变。可以重新读取这一页。</p>
        <button onClick={() => void load()} type="button"><RefreshCw aria-hidden="true" size={15} />重新读取</button>
      </section>
    );
  }

  if (loading) {
    return <section aria-label="正在读取知识网络" className="knowledge-loading"><span /><span /><span /></section>;
  }

  if (!graph.topics.length) {
    return (
      <section aria-label="知识网络" className="knowledge-state">
        <Network aria-hidden="true" size={27} />
        <h2>知识网络会从已整理内容生长</h2>
        <p>在题目档案的“知识点”字段中保存内容后，这里会自动建立课程与错题的关系。</p>
      </section>
    );
  }

  return (
    <div className="knowledge-workspace">
      <aside aria-label="知识网络筛选" className="knowledge-rail">
        <header><Network aria-hidden="true" size={18} /><strong>关系视图</strong></header>
        <p>全部课程</p>
        <div className="knowledge-filter" role="group" aria-label="筛选知识点">
          {([['all', '全部'], ['weak', '薄弱'], ['due', '待复习']] as const).map(([value, label]) => (
            <button aria-pressed={filter === value} key={value} onClick={() => { setFilter(value); setSelectedTopicId(null); }} type="button">{label}</button>
          ))}
        </div>
        <dl>
          <div><dt>知识点</dt><dd>{graph.topics.length}</dd></div>
          <div><dt>关联题</dt><dd>{graph.problems.length}</dd></div>
          <div><dt>待复习</dt><dd>{graph.topics.reduce((total, topic) => total + topic.dueCount, 0)}</dd></div>
        </dl>
        <small>拖动画布平移，按住 Ctrl 滚轮缩放。</small>
      </aside>
      <KnowledgeCanvas graph={visibleGraph} onSelectTopic={(topic: KnowledgeTopic) => setSelectedTopicId(topic.id)} selectedTopicId={selectedTopicId} />
      <KnowledgeInspector onOpenProblem={onOpenProblem} problems={relatedProblems} topic={selectedTopic} />
    </div>
  );
}
