import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, test, vi } from 'vitest';
import { importClipboardImage } from '../../lib/tauri';
import { ClipboardImageCapture } from './ClipboardImageCapture';

vi.mock('../../lib/tauri', () => ({ importClipboardImage: vi.fn() }));

class SuccessfulFileReader {
  result: string | ArrayBuffer | null = null;
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  readAsDataURL() { this.result = 'data:image/png;base64,iVBORw0KGgo='; this.onload?.(); }
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('FileReader', SuccessfulFileReader);
});

test('pastes an image into the active course without disturbing text inputs', async () => {
  vi.mocked(importClipboardImage).mockResolvedValue({
    id: 'inbox-clip', problemId: 'problem-clip', attachmentId: 'attachment-clip', filename: '截图.png', createdAt: '1',
  });
  const onImported = vi.fn();
  const view = render(<><input aria-label="题干" /><ClipboardImageCapture courseId="macro" onImported={onImported} onOpenInbox={vi.fn()} /></>);
  const file = new File(['png'], 'clipboard.png', { type: 'image/png' });
  const clipboardData = { items: [{ kind: 'file', type: 'image/png', getAsFile: () => file }] };

  fireEvent.paste(view.container, { clipboardData });
  await waitFor(() => expect(importClipboardImage).toHaveBeenCalledWith('iVBORw0KGgo=', 'image/png', 'macro'));
  expect(await screen.findByText('截图已保存到待整理')).toBeVisible();
  expect(onImported).toHaveBeenCalledWith(['problem-clip']);

  fireEvent.paste(screen.getByLabelText('题干'), { clipboardData });
  expect(importClipboardImage).toHaveBeenCalledTimes(1);
});
