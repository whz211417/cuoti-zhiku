import type { UnlistenFn } from '@tauri-apps/api/event';
import { getCurrentWindow } from '@tauri-apps/api/window';

export type WindowFileDrop = {
  type: 'enter' | 'over' | 'drop' | 'leave';
  paths: string[];
};

export async function subscribeToWindowFileDrop(
  listener: (event: WindowFileDrop) => void,
): Promise<UnlistenFn> {
  return getCurrentWindow().onDragDropEvent(({ payload }) => {
    listener({
      type: payload.type,
      paths: 'paths' in payload ? payload.paths : [],
    });
  });
}
