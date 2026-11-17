import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, test, vi } from 'vitest';
import { ArchiveLibrary } from './ArchiveLibrary';

const { getAllProblems, listTrashedProblems, restoreProblem, trashProblem } = vi.hoisted(() => ({
  getAllProblems: vi.fn(),
  listTrashedProblems: vi.fn(),
  restoreProblem: vi.fn(),
  trashProblem: vi.fn(),
}));
vi.mock('../../lib/tauri', () => ({ getAllProblems, listTrashedProblems, restoreProblem, trashProblem }));
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

const archivedProblem = {
  id: 'policy-question', courseId: 'macro', courseName: '宏观经济学', title: '财政政策练习',
  fallbackFilename: '课堂习题.png', status: 'active', updatedAt: '2026-11-16T04:00:00Z',
};

test('right-clicks a specific archive row, confirms its removal, and restores it from 最近删除', async () => {
  const user = userEvent.setup();
  const onOpenProblem = vi.fn();
  getAllProblems.mockResolvedValueOnce([archivedProblem]).mockResolvedValueOnce([]).mockResolvedValue([archivedProblem]);
  trashProblem.mockResolvedValue(undefined);
  listTrashedProblems.mockResolvedValue([{
    id: archivedProblem.id, title: archivedProblem.title, courseName: archivedProblem.courseName,
    deletedAt: '2026-11-17T04:00:00Z',
  }]);
  restoreProblem.mockResolvedValue(undefined);
  render(<ArchiveLibrary courseId="macro" onOpenProblem={onOpenProblem} />);

  const row = await screen.findByRole('button', { name: '打开 财政政策练习' });
  fireEvent.contextMenu(row, { clientX: 200, clientY: 240 });
  await user.click(screen.getByRole('menuitem', { name: '移入最近删除…' }));
  const confirmation = screen.getByRole('dialog', { name: '移入最近删除' });
  expect(within(confirmation).getByText(/财政政策练习/)).toBeVisible();
  expect(trashProblem).not.toHaveBeenCalled();
  expect(onOpenProblem).not.toHaveBeenCalled();
  await user.click(within(confirmation).getByRole('button', { name: '移入最近删除' }));

  expect(trashProblem).toHaveBeenCalledExactlyOnceWith('policy-question');
  expect(screen.queryByRole('button', { name: '打开 财政政策练习' })).not.toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: '最近删除' }));
  await user.click(await screen.findByRole('button', { name: '恢复 财政政策练习' }));
  expect(restoreProblem).toHaveBeenCalledExactlyOnceWith('policy-question');
  expect(await screen.findByText('还没有最近删除的题目。')).toBeVisible();
  await user.click(screen.getByRole('button', { name: '返回题目档案' }));
  expect(await screen.findByRole('button', { name: '打开 财政政策练习' })).toBeVisible();
});

test('keeps a problem in the archive when deletion fails', async () => {
  const user = userEvent.setup();
  getAllProblems.mockResolvedValue([archivedProblem]);
  trashProblem.mockRejectedValue(new Error('database write failed'));
  render(<ArchiveLibrary courseId="macro" onOpenProblem={vi.fn()} />);

  await user.click(await screen.findByRole('button', { name: '更多操作：财政政策练习' }));
  await user.click(screen.getByRole('menuitem', { name: '移入最近删除…' }));
  const confirmation = screen.getByRole('dialog', { name: '移入最近删除' });
  await user.click(within(confirmation).getByRole('button', { name: '移入最近删除' }));

  expect(await within(confirmation).findByRole('alert')).toHaveTextContent('题目没有移入最近删除');
  await user.click(within(confirmation).getByRole('button', { name: '取消' }));
  expect(screen.getByRole('button', { name: '打开 财政政策练习' })).toBeVisible();
});
