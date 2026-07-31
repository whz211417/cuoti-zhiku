import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, test, vi } from 'vitest';
import type { LibrarySearchResult, RecentProblem } from '../../lib/tauri';
import { CommandPalette } from './CommandPalette';

const { searchLibrary } = vi.hoisted(() => ({ searchLibrary: vi.fn() }));
vi.mock('../../lib/tauri', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/tauri')>()),
  searchLibrary,
}));

const recentProblems: RecentProblem[] = [
  {
    id: 'recent-1',
    courseId: 'macro',
    courseName: '宏观经济学',
    title: '最近整理的 IS 曲线题',
    fallbackFilename: 'is-curve.png',
    status: 'active',
    updatedAt: '2026-07-30T08:30:00Z',
  },
];

const props = {
  onClose: vi.fn(),
  onOpenCourse: vi.fn(),
  onOpenMaterial: vi.fn(),
  onOpenProblem: vi.fn(),
  recentProblems,
};

const results: LibrarySearchResult[] = [
  {
    kind: 'material',
    id: 'material-1',
    courseId: 'macro',
    title: '第六章讲义.md',
    snippet: 'LM 曲线随货币供给变化。',
    updatedAt: '2026-07-30T08:00:00Z',
  },
  {
    kind: 'problem',
    id: 'problem-1',
    courseId: 'macro',
    title: 'IS 曲线计算题',
    snippet: '求均衡产出。',
    updatedAt: '2026-07-29T08:00:00Z',
  },
  {
    kind: 'course',
    id: 'macro',
    courseId: 'macro',
    title: '宏观经济学',
    snippet: '2026 春',
    updatedAt: '2026-07-28T08:00:00Z',
  },
];

beforeEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

test('renders the accessible Spotlight dialog and focuses its searchbox', () => {
  render(<CommandPalette {...props} open />);

  expect(screen.getByRole('dialog', { name: '全局搜索' })).toHaveAttribute('aria-modal', 'true');
  expect(screen.getByRole('searchbox', { name: '搜索本地资料库' })).toHaveFocus();
});

test('waits 180ms and searches only queries with two trimmed characters', async () => {
  vi.useFakeTimers();
  searchLibrary.mockResolvedValue(results);
  render(<CommandPalette {...props} open />);
  const searchbox = screen.getByRole('searchbox', { name: '搜索本地资料库' });

  fireEvent.change(searchbox, { target: { value: '  I ' } });
  await act(() => vi.advanceTimersByTimeAsync(180));
  expect(searchLibrary).not.toHaveBeenCalled();

  fireEvent.change(searchbox, { target: { value: '  IS  ' } });
  await act(() => vi.advanceTimersByTimeAsync(179));
  expect(searchLibrary).not.toHaveBeenCalled();
  await act(() => vi.advanceTimersByTimeAsync(1));
  expect(searchLibrary).toHaveBeenCalledWith('IS', 12);
});

test('groups problem, course, and material matches with explicit accessible names', async () => {
  vi.useFakeTimers();
  searchLibrary.mockResolvedValue(results);
  render(<CommandPalette {...props} open />);

  fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'IS' } });
  await act(() => vi.advanceTimersByTimeAsync(180));

  expect(screen.getByRole('heading', { name: '题目' })).toBeVisible();
  expect(screen.getByRole('heading', { name: '课程' })).toBeVisible();
  expect(screen.getByRole('heading', { name: '资料' })).toBeVisible();
  expect(screen.getByRole('button', { name: '打开题目：IS 曲线计算题' })).toBeVisible();
  expect(screen.getByRole('button', { name: '打开课程：宏观经济学' })).toBeVisible();
  expect(screen.getByRole('button', { name: '打开资料：第六章讲义.md' })).toBeVisible();
});

test('shows recent problems while the query is empty', async () => {
  const user = userEvent.setup();
  render(<CommandPalette {...props} open />);

  const recent = screen.getByRole('region', { name: '最近题目' });
  await user.click(within(recent).getByRole('button', { name: '打开最近题目：最近整理的 IS 曲线题' }));
  expect(props.onOpenProblem).toHaveBeenCalledWith('recent-1');
});

test('hides recent problems and guides a one-character query', () => {
  render(<CommandPalette {...props} open />);

  fireEvent.change(screen.getByRole('searchbox'), { target: { value: '  I  ' } });

  expect(screen.queryByRole('region', { name: '最近题目' })).not.toBeInTheDocument();
  expect(screen.getByText('再输入一个字符开始搜索。')).toBeVisible();
});

test('wraps keyboard selection and Enter opens exactly one selected result', async () => {
  vi.useFakeTimers();
  searchLibrary.mockResolvedValue(results);
  render(<CommandPalette {...props} open />);
  const searchbox = screen.getByRole('searchbox');
  fireEvent.change(searchbox, { target: { value: 'IS' } });
  await act(() => vi.advanceTimersByTimeAsync(180));
  const problem = screen.getByRole('button', { name: '打开题目：IS 曲线计算题' });
  const material = screen.getByRole('button', { name: '打开资料：第六章讲义.md' });

  expect(problem).toHaveAttribute('aria-current', 'true');
  fireEvent.keyDown(searchbox, { key: 'ArrowUp' });
  expect(material).toHaveAttribute('aria-current', 'true');
  fireEvent.keyDown(searchbox, { key: 'ArrowDown' });
  expect(problem).toHaveAttribute('aria-current', 'true');
  fireEvent.keyDown(searchbox, { key: 'Enter' });

  expect(props.onOpenProblem).toHaveBeenCalledTimes(1);
  expect(props.onOpenProblem).toHaveBeenCalledWith('problem-1');
  expect(props.onOpenCourse).not.toHaveBeenCalled();
  expect(props.onOpenMaterial).not.toHaveBeenCalled();
});

test('passes the selected course and trimmed query when opening a material', async () => {
  vi.useFakeTimers();
  searchLibrary.mockResolvedValue([results[0]]);
  render(<CommandPalette {...props} open />);
  const searchbox = screen.getByRole('searchbox');
  fireEvent.change(searchbox, { target: { value: '  LM 曲线  ' } });
  await act(() => vi.advanceTimersByTimeAsync(180));

  fireEvent.keyDown(searchbox, { key: 'Enter' });
  expect(props.onOpenMaterial).toHaveBeenCalledWith('macro', 'LM 曲线');
});

test('Escape closes, clears, and reopening starts clean', async () => {
  const view = render(<CommandPalette {...props} open />);
  const searchbox = screen.getByRole('searchbox');
  fireEvent.change(searchbox, { target: { value: 'IS' } });
  fireEvent.keyDown(searchbox, { key: 'Escape' });
  expect(props.onClose).toHaveBeenCalledOnce();

  view.rerender(<CommandPalette {...props} open={false} />);
  view.rerender(<CommandPalette {...props} open />);
  expect(screen.getByRole('searchbox')).toHaveValue('');
  expect(screen.getByRole('region', { name: '最近题目' })).toBeVisible();
  expect(searchLibrary).not.toHaveBeenCalled();
});

test('Escape closes once when focus has moved to the close button', async () => {
  const user = userEvent.setup();
  render(<CommandPalette {...props} open />);

  await user.tab({ shift: true });
  expect(screen.getByRole('button', { name: '关闭全局搜索' })).toHaveFocus();
  await user.keyboard('{Escape}');

  expect(props.onClose).toHaveBeenCalledOnce();
});

test('Escape closes once when a result button has focus', async () => {
  vi.useFakeTimers();
  searchLibrary.mockResolvedValue(results);
  render(<CommandPalette {...props} open />);
  fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'IS' } });
  await act(() => vi.advanceTimersByTimeAsync(180));
  const result = screen.getByRole('button', { name: '打开题目：IS 曲线计算题' });

  result.focus();
  fireEvent.keyDown(result, { key: 'Escape' });

  expect(props.onClose).toHaveBeenCalledOnce();
});

test('suppresses an older response that resolves after a newer search', async () => {
  vi.useFakeTimers();
  let resolveOlder!: (value: LibrarySearchResult[]) => void;
  let resolveNewer!: (value: LibrarySearchResult[]) => void;
  searchLibrary
    .mockReturnValueOnce(new Promise((resolve) => { resolveOlder = resolve; }))
    .mockReturnValueOnce(new Promise((resolve) => { resolveNewer = resolve; }));
  render(<CommandPalette {...props} open />);
  const searchbox = screen.getByRole('searchbox');

  fireEvent.change(searchbox, { target: { value: 'IS' } });
  await act(() => vi.advanceTimersByTimeAsync(180));
  fireEvent.change(searchbox, { target: { value: 'LM' } });
  await act(() => vi.advanceTimersByTimeAsync(180));
  await act(async () => resolveNewer([{ ...results[1], id: 'newer', title: '新的 LM 题目' }]));
  expect(screen.getByRole('button', { name: '打开题目：新的 LM 题目' })).toBeVisible();

  await act(async () => resolveOlder([{ ...results[1], id: 'older', title: '旧的 IS 题目' }]));
  expect(screen.queryByRole('button', { name: '打开题目：旧的 IS 题目' })).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: '打开题目：新的 LM 题目' })).toBeVisible();
});

test('shows search errors and a useful no-results state', async () => {
  vi.useFakeTimers();
  searchLibrary.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce([]);
  render(<CommandPalette {...props} open />);
  const searchbox = screen.getByRole('searchbox');

  fireEvent.change(searchbox, { target: { value: 'IS' } });
  await act(() => vi.advanceTimersByTimeAsync(180));
  expect(screen.getByRole('alert')).toHaveTextContent('搜索暂时无法完成。');

  fireEvent.change(searchbox, { target: { value: 'LM' } });
  await act(() => vi.advanceTimersByTimeAsync(180));
  expect(screen.getByText('没有找到相关结果。')).toBeVisible();
});
