import { beforeEach, expect, test, vi } from 'vitest';
import { subscribeToWindowFileDrop } from './windowFileDrop';

const { onDragDropEvent } = vi.hoisted(() => ({ onDragDropEvent: vi.fn() }));

vi.mock('@tauri-apps/api/window', () => ({
  getCurrentWindow: () => ({ onDragDropEvent }),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

test('normalizes Tauri drop events and unregisters the listener', async () => {
  const listener = vi.fn();
  const unlisten = vi.fn();
  onDragDropEvent.mockImplementation(async (handler) => {
    handler({ payload: { type: 'drop', paths: ['C:\\题图.png'], position: { x: 10, y: 20 } } });
    return unlisten;
  });

  const stop = await subscribeToWindowFileDrop(listener);

  expect(listener).toHaveBeenCalledWith({ type: 'drop', paths: ['C:\\题图.png'] });
  stop();
  expect(unlisten).toHaveBeenCalledOnce();
});

test('normalizes enter and leave payloads without paths', async () => {
  const listener = vi.fn();
  onDragDropEvent.mockImplementation(async (handler) => {
    handler({ payload: { type: 'enter', paths: ['C:\\a.pdf'], position: { x: 1, y: 1 } } });
    handler({ payload: { type: 'leave' } });
    return vi.fn();
  });

  await subscribeToWindowFileDrop(listener);

  expect(listener).toHaveBeenNthCalledWith(1, { type: 'enter', paths: ['C:\\a.pdf'] });
  expect(listener).toHaveBeenNthCalledWith(2, { type: 'leave', paths: [] });
});
