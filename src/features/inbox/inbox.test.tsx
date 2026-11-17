import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, test, vi } from 'vitest';
import { IngestDropzone } from './IngestDropzone';

const { open, importFiles, getInboxItems, trashProblem } = vi.hoisted(() => ({
  open: vi.fn(),
  importFiles: vi.fn(),
  getInboxItems: vi.fn(),
  trashProblem: vi.fn(),
}));

vi.mock('@tauri-apps/plugin-dialog', () => ({ open }));
vi.mock('../../lib/tauri', () => ({ getInboxItems, importFiles, trashProblem }));

beforeEach(() => {
  vi.clearAllMocks();
  getInboxItems.mockResolvedValue([]);
});

test('restores locally stored inbox items when the app opens', async () => {
  getInboxItems.mockResolvedValue([
    { id: 'inbox-stored', problemId: 'problem-stored', attachmentId: 'attachment-stored', filename: 'chapter-3.png', createdAt: '2' },
  ]);

  render(<IngestDropzone courseId={null} />);

  expect(await screen.findByText('chapter-3.png')).toBeVisible();
  expect(screen.getByText('已安全保存')).toBeVisible();
});

test('shows each successfully stored file in the inbox after selection', async () => {
  open.mockResolvedValue(['C:/notes/is-lm.pdf']);
  importFiles.mockResolvedValue([
    {
      sourcePath: 'C:/notes/is-lm.pdf',
      item: { id: 'inbox-1', problemId: 'problem-1', attachmentId: 'attachment-1', filename: 'is-lm.pdf', createdAt: '1' },
      error: null,
    },
  ]);

  const onOpenProblem = vi.fn();
  render(<IngestDropzone courseId={null} onOpenProblem={onOpenProblem} />);
  await userEvent.click(screen.getByRole('button', { name: '投进题目' }));

  expect(await screen.findByText('is-lm.pdf')).toBeVisible();
  expect(screen.getByText('已安全保存')).toBeVisible();
  expect(onOpenProblem).toHaveBeenCalledWith('problem-1');
});

test('opens the first successful import in source order and skips failures', async () => {
  open.mockResolvedValue(['C:/bad.exe', 'C:/first.pdf', 'C:/second.png']);
  importFiles.mockResolvedValue([
    { sourcePath: 'C:/bad.exe', item: null, error: '暂不支持' },
    { sourcePath: 'C:/first.pdf', item: { id: 'i1', problemId: 'problem-first', attachmentId: 'a1', filename: 'first.pdf', createdAt: '1' }, error: null },
    { sourcePath: 'C:/second.png', item: { id: 'i2', problemId: 'problem-second', attachmentId: 'a2', filename: 'second.png', createdAt: '2' }, error: null },
  ]);
  const onImported = vi.fn();
  const onOpenProblem = vi.fn();

  render(<IngestDropzone courseId="macro" onImported={onImported} onOpenProblem={onOpenProblem} />);
  await userEvent.click(screen.getByRole('button', { name: '投进题目' }));

  expect(onImported).toHaveBeenCalledWith(['problem-first', 'problem-second']);
  expect(onOpenProblem).toHaveBeenCalledOnce();
  expect(onOpenProblem).toHaveBeenCalledWith('problem-first');
});

test('opens the item menu with Shift+F10 and removes only the confirmed inbox item', async () => {
  const user = userEvent.setup();
  const onProblemTrashed = vi.fn();
  getInboxItems.mockResolvedValue([
    { id: 'i1', problemId: 'p1', attachmentId: 'a1', filename: '重复题目.pdf', createdAt: '1' },
    { id: 'i2', problemId: 'p2', attachmentId: 'a2', filename: '继续整理.png', createdAt: '2' },
  ]);
  trashProblem.mockResolvedValue(undefined);
  render(<IngestDropzone courseId={null} onProblemTrashed={onProblemTrashed} />);

  const row = await screen.findByRole('button', { name: /^重复题目\.pdf/ });
  row.focus();
  await user.keyboard('{Shift>}{F10}{/Shift}');
  await user.keyboard('{ArrowDown}{Enter}');
  const dialog = screen.getByRole('dialog', { name: '移入最近删除' });
  expect(within(dialog).getByRole('button', { name: '取消' })).toHaveFocus();
  await user.click(within(dialog).getByRole('button', { name: '取消' }));
  expect(trashProblem).not.toHaveBeenCalled();

  await user.click(screen.getByRole('button', { name: '更多操作：重复题目.pdf' }));
  await user.click(screen.getByRole('menuitem', { name: '移入最近删除…' }));
  await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: '移入最近删除' }));
  expect(trashProblem).toHaveBeenCalledExactlyOnceWith('p1');
  expect(onProblemTrashed).toHaveBeenCalledExactlyOnceWith('p1');
  expect(screen.queryByText('重复题目.pdf')).not.toBeInTheDocument();
  expect(screen.getByText('继续整理.png')).toBeVisible();
});
