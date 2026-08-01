import { act, render, screen, waitFor } from '@testing-library/react';
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
