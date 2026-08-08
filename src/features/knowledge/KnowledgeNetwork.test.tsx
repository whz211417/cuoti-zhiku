import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, test, vi } from 'vitest';
import { getKnowledgeGraph } from '../../lib/tauri';
import { KnowledgeNetwork } from './KnowledgeNetwork';

vi.mock('../../lib/tauri', async () => {
  const actual = await vi.importActual<typeof import('../../lib/tauri')>('../../lib/tauri');
  return { ...actual, getKnowledgeGraph: vi.fn() };
});

const graph = {
  courses: [{ id: 'macro', name: '宏观经济学', color: '#5e9ce6', topicCount: 1, problemCount: 2, dueCount: 1 }],
  topics: [{
    id: 'topic-macro-is', courseId: 'macro', name: 'IS 曲线', problemCount: 2, dueCount: 1,
    masteryScore: 45, lastReviewedAt: null, mistakeReasons: ['混淆斜率'], problemIds: ['p-1', 'p-2'],
  }],
  problems: [
    { id: 'p-1', courseId: 'macro', title: '财政扩张如何移动 IS 曲线', status: 'active', due: true, lastReviewedAt: null },
    { id: 'p-2', courseId: 'macro', title: '利率与投资的关系', status: 'active', due: false, lastReviewedAt: '2026-08-01' },
  ],
  edges: [],
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getKnowledgeGraph).mockResolvedValue(graph);
});

test('loads a course graph, filters weak topics, and opens a related problem', async () => {
  const user = userEvent.setup();
  const onOpenProblem = vi.fn();
  render(<KnowledgeNetwork courseId="macro" onOpenProblem={onOpenProblem} refreshToken={0} />);

  expect(await screen.findByRole('button', { name: /IS 曲线/ })).toBeInTheDocument();
  expect(getKnowledgeGraph).toHaveBeenCalledWith('macro', expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/));

  await user.click(screen.getByRole('button', { name: /IS 曲线/ }));
  const inspector = screen.getByRole('complementary', { name: '知识点摘要' });
  expect(inspector).toHaveTextContent(/2\s*道关联题/);
  expect(inspector).toHaveTextContent('混淆斜率');

  await user.click(screen.getByRole('button', { name: '打开题目：财政扩张如何移动 IS 曲线' }));
  expect(onOpenProblem).toHaveBeenCalledWith('p-1');
});

test('keeps a useful empty state and retries a failed local query', async () => {
  const user = userEvent.setup();
  vi.mocked(getKnowledgeGraph).mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(graph);
  render(<KnowledgeNetwork courseId={null} onOpenProblem={vi.fn()} refreshToken={0} />);

  expect(await screen.findByRole('alert')).toHaveTextContent('知识网络暂时无法读取');
  await user.click(screen.getByRole('button', { name: '重新读取' }));
  await waitFor(() => expect(screen.getByRole('button', { name: /IS 曲线/ })).toBeInTheDocument());
});
