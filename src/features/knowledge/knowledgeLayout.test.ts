import { expect, test } from 'vitest';
import type { KnowledgeGraph } from '../../lib/tauri';
import { layoutKnowledgeGraph } from './knowledgeLayout';

const graph: KnowledgeGraph = {
  courses: [{ id: 'macro', name: '宏观经济学', color: '#5e9ce6', topicCount: 2, problemCount: 3, dueCount: 1 }],
  topics: [
    { id: 'topic-macro-is', courseId: 'macro', name: 'IS 曲线', problemCount: 2, dueCount: 1, masteryScore: 45, lastReviewedAt: null, mistakeReasons: [], problemIds: ['p-1', 'p-2'] },
    { id: 'topic-macro-lm', courseId: 'macro', name: 'LM 曲线', problemCount: 1, dueCount: 0, masteryScore: 80, lastReviewedAt: '2026-08-01', mistakeReasons: [], problemIds: ['p-3'] },
  ],
  problems: [],
  edges: [],
};

test('lays out a course and topics deterministically in readable columns', () => {
  const layout = layoutKnowledgeGraph(graph);

  expect(layout.nodes.find((node) => node.id === 'macro')).toMatchObject({ x: 72, y: 154, kind: 'course' });
  expect(layout.nodes.find((node) => node.id === 'topic-macro-is')).toMatchObject({ x: 360, y: 92, kind: 'topic' });
  expect(layout.nodes.find((node) => node.id === 'topic-macro-lm')).toMatchObject({ x: 360, y: 180, kind: 'topic' });
  expect(layout.edges).toHaveLength(2);
});
