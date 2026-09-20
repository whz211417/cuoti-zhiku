import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, test, vi } from 'vitest';
import { ArchiveLibrary } from './ArchiveLibrary';

const { getAllProblems } = vi.hoisted(() => ({ getAllProblems: vi.fn() }));
vi.mock('../../lib/tauri', () => ({ getAllProblems }));
vi.mock('../materials/MaterialsLibrary', () => ({
  MaterialsLibrary: ({ courseId }: { courseId: string | null }) => (
    <section aria-label="课程资料库">materials:{courseId ?? ''}</section>
  ),
}));

beforeEach(() => vi.clearAllMocks());

test('loads all non-trashed problems, opens one, and keeps course materials accessible', async () => {
  const user = userEvent.setup();
  const onOpenProblem = vi.fn();
  getAllProblems.mockResolvedValue([{
    id: 'problem-1', courseId: 'macro', courseName: '宏观经济学', title: 'IS 曲线移动',
    fallbackFilename: 'is.png', status: 'active', updatedAt: '2026-07-30T08:00:00Z',
  }]);

  render(<ArchiveLibrary courseId="macro" onOpenProblem={onOpenProblem} />);

  await user.click(await screen.findByRole('button', { name: '打开 IS 曲线移动' }));
  expect(onOpenProblem).toHaveBeenCalledWith('problem-1');
  expect(screen.getByRole('region', { name: '课程资料库' })).toHaveTextContent('materials:macro');
});

test('exposes book export directly from the archive heading', async () => {
  getAllProblems.mockResolvedValue([]);
  const onExport = vi.fn();
  render(<ArchiveLibrary courseId={null} onExport={onExport} onOpenProblem={vi.fn()} />);

  await userEvent.click(await screen.findByRole('button', { name: '导出题册' }));

  expect(onExport).toHaveBeenCalledOnce();
});

test('shows loading and empty archive states', async () => {
  let resolve!: (value: []) => void;
  getAllProblems.mockReturnValue(new Promise<[]>((next) => { resolve = next; }));
  render(<ArchiveLibrary courseId={null} onOpenProblem={vi.fn()} />);

  expect(screen.getByRole('status')).toHaveTextContent('正在读取题目档案');
  resolve([]);
  expect(await screen.findByText('还没有题目档案')).toBeVisible();
});

test('shows an accessible error and recovers without leaving the archive', async () => {
  const user = userEvent.setup();
  getAllProblems
    .mockRejectedValueOnce(new Error('read failed'))
    .mockResolvedValueOnce([{
      id: 'problem-recovered', courseId: 'macro', courseName: '宏观经济学', title: '恢复后的题目',
      fallbackFilename: '', status: 'inbox', updatedAt: '2026-07-31T08:00:00Z',
    }]);
  render(<ArchiveLibrary courseId="macro" onOpenProblem={vi.fn()} />);

  expect(await screen.findByRole('alert')).toHaveTextContent('题目档案暂时无法读取');
  await user.click(screen.getByRole('button', { name: '重新读取题目档案' }));
  expect(await screen.findByRole('button', { name: '打开 恢复后的题目' })).toBeVisible();
});
