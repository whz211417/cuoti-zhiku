import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, test, vi } from 'vitest';
import { GlobalFileDrop } from './GlobalFileDrop';
import type { WindowFileDrop } from './windowFileDrop';

const { importFiles, subscribeToWindowFileDrop } = vi.hoisted(() => ({
  importFiles: vi.fn(),
  subscribeToWindowFileDrop: vi.fn(),
}));

vi.mock('../../lib/tauri', () => ({ importFiles }));
vi.mock('./windowFileDrop', () => ({ subscribeToWindowFileDrop }));

let emitDrop: (event: WindowFileDrop) => void;
let unlisten: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  unlisten = vi.fn();
  subscribeToWindowFileDrop.mockImplementation(async (listener) => {
    emitDrop = listener;
    return unlisten;
  });
});

test('shows drop guidance then preserves partial import results', async () => {
  importFiles.mockResolvedValue([
    { sourcePath: 'C:\\a.png', item: { id: 'i1', problemId: 'p1', attachmentId: 'a1', filename: 'a.png', createdAt: 'now' }, error: null },
    { sourcePath: 'C:\\bad.exe', item: null, error: '暂不支持此文件' },
  ]);

  render(<GlobalFileDrop courseId={null} onImported={vi.fn()} onOpenInbox={vi.fn()} />);
  await waitFor(() => expect(subscribeToWindowFileDrop).toHaveBeenCalledOnce());

  act(() => emitDrop({ type: 'enter', paths: ['C:\\a.png', 'C:\\bad.exe'] }));
  expect(screen.getByText('松手即可保存到待整理')).toBeVisible();
  expect(screen.getByText('支持 PNG、JPG、JPEG、WEBP、PDF、Markdown、MD、TXT')).toBeVisible();

  await act(async () => emitDrop({ type: 'drop', paths: ['C:\\a.png', 'C:\\bad.exe'] }));
  expect(await screen.findByText('已保存 1 个，1 个未导入')).toBeVisible();
});

test('ignores a second drop while importing and captures the course at drop time', async () => {
  let resolveImport!: (value: unknown) => void;
  importFiles.mockReturnValue(new Promise((resolve) => { resolveImport = resolve; }));
  const onImported = vi.fn();
  const { rerender } = render(<GlobalFileDrop courseId="macro" onImported={onImported} onOpenInbox={vi.fn()} />);
  await waitFor(() => expect(subscribeToWindowFileDrop).toHaveBeenCalledOnce());

  act(() => emitDrop({ type: 'drop', paths: ['C:\\first.pdf'] }));
  rerender(<GlobalFileDrop courseId="finance" onImported={onImported} onOpenInbox={vi.fn()} />);
  act(() => emitDrop({ type: 'drop', paths: ['C:\\second.pdf'] }));
  expect(importFiles).toHaveBeenCalledOnce();
  expect(importFiles).toHaveBeenCalledWith(['C:\\first.pdf'], 'macro');

  await act(async () => resolveImport([{ sourcePath: 'C:\\first.pdf', item: { id: 'i1', problemId: 'p1', attachmentId: 'a1', filename: 'first.pdf', createdAt: 'now' }, error: null }]));
  expect(await screen.findByText('已保存 1 个')).toBeVisible();
  expect(onImported).toHaveBeenCalledOnce();
});

test('unregisters the native event subscription after unmount', async () => {
  const view = render(<GlobalFileDrop courseId={null} onImported={vi.fn()} onOpenInbox={vi.fn()} />);
  await waitFor(() => expect(subscribeToWindowFileDrop).toHaveBeenCalledOnce());

  view.unmount();

  expect(unlisten).toHaveBeenCalledOnce();
});

test('keeps the visible shell non-interactive until the import result is complete', async () => {
  let resolveImport!: (value: unknown) => void;
  importFiles.mockReturnValue(new Promise((resolve) => { resolveImport = resolve; }));
  const onOpenInbox = vi.fn();
  render(<GlobalFileDrop courseId={null} onImported={vi.fn()} onOpenInbox={onOpenInbox} />);
  await waitFor(() => expect(subscribeToWindowFileDrop).toHaveBeenCalledOnce());

  act(() => emitDrop({ type: 'enter', paths: ['C:\\one.pdf'] }));
  expect(screen.getByLabelText('拖放文件导入')).not.toHaveClass('is-complete');
  act(() => emitDrop({ type: 'drop', paths: ['C:\\one.pdf'] }));
  expect(screen.getByLabelText('拖放文件导入')).not.toHaveClass('is-complete');

  await act(async () => resolveImport([{ sourcePath: 'C:\\one.pdf', item: { id: 'i1', problemId: 'p1', attachmentId: 'a1', filename: 'one.pdf', createdAt: 'now' }, error: null }]));
  expect(screen.getByLabelText('拖放文件导入')).toHaveClass('is-complete');
  await userEvent.click(screen.getByRole('button', { name: '查看待整理' }));
  expect(onOpenInbox).toHaveBeenCalledOnce();
});

test('keeps guidance current on over then hides it on leave', async () => {
  render(<GlobalFileDrop courseId={null} onImported={vi.fn()} onOpenInbox={vi.fn()} />);
  await waitFor(() => expect(subscribeToWindowFileDrop).toHaveBeenCalledOnce());

  act(() => emitDrop({ type: 'enter', paths: ['C:\\one.pdf'] }));
  act(() => emitDrop({ type: 'over', paths: ['C:\\one.pdf', 'C:\\two.png'] }));
  expect(screen.getByText('准备导入 2 个文件')).toBeVisible();
  act(() => emitDrop({ type: 'leave', paths: [] }));
  expect(screen.getByLabelText('拖放文件导入')).toHaveAttribute('aria-hidden', 'true');
});

test('keeps the error result visible when native import rejects', async () => {
  importFiles.mockRejectedValue(new Error('native import unavailable'));
  render(<GlobalFileDrop courseId={null} onImported={vi.fn()} onOpenInbox={vi.fn()} />);
  await waitFor(() => expect(subscribeToWindowFileDrop).toHaveBeenCalledOnce());

  await act(async () => emitDrop({ type: 'drop', paths: ['C:\\one.pdf'] }));

  expect(await screen.findByText('未能导入 1 个文件')).toBeVisible();
  expect(screen.getByText('未导入的文件不会影响已经保存的原件。')).toBeVisible();
});
