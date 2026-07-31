import { open } from '@tauri-apps/plugin-dialog';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createElement } from 'react';
import { beforeEach, expect, test, vi } from 'vitest';
import { getInboxItems, importFiles } from '../../lib/tauri';
import { IngestDropzone } from './IngestDropzone';
import { selectProblemFiles } from './selectProblemFiles';

vi.mock('@tauri-apps/plugin-dialog', () => ({ open: vi.fn() }));
vi.mock('../../lib/tauri', () => ({ getInboxItems: vi.fn(), importFiles: vi.fn() }));

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getInboxItems).mockResolvedValue([]);
});

test('returns no results when file selection is cancelled', async () => {
  vi.mocked(open).mockResolvedValue(null);

  await expect(selectProblemFiles(null)).resolves.toEqual([]);

  expect(importFiles).not.toHaveBeenCalled();
});

test('imports a single selected file without an unset course', async () => {
  const results = [{ sourcePath: 'C:/notes/is-lm.pdf', item: null, error: 'failed' }];
  vi.mocked(open).mockResolvedValue('C:/notes/is-lm.pdf');
  vi.mocked(importFiles).mockResolvedValue(results);

  await expect(selectProblemFiles(null)).resolves.toEqual(results);

  expect(importFiles).toHaveBeenCalledWith(['C:/notes/is-lm.pdf'], undefined);
});

test('imports every selected file into the active course', async () => {
  const paths = ['C:/notes/is-lm.pdf', 'C:/notes/lm-curve.png'];
  const results = [
    { sourcePath: paths[0], item: null, error: 'failed' },
    { sourcePath: paths[1], item: null, error: 'failed' },
  ];
  vi.mocked(open).mockResolvedValue(paths);
  vi.mocked(importFiles).mockResolvedValue(results);

  await expect(selectProblemFiles('macro')).resolves.toEqual(results);

  expect(importFiles).toHaveBeenCalledWith(paths, 'macro');
  expect(open).toHaveBeenCalledWith({
    multiple: true,
    filters: [{ name: '题目与资料', extensions: ['png', 'jpg', 'jpeg', 'webp', 'pdf'] }],
  });
});

test('reports one completed ingest only when at least one file was saved', async () => {
  const onImported = vi.fn();
  vi.mocked(open).mockResolvedValue(['saved.pdf', 'failed.pdf']);
  vi.mocked(importFiles).mockResolvedValue([
    {
      sourcePath: 'saved.pdf',
      item: { id: 'inbox-1', problemId: 'problem-1', attachmentId: 'attachment-1', filename: 'saved.pdf', createdAt: '1' },
      error: null,
    },
    { sourcePath: 'failed.pdf', item: null, error: 'disk full' },
  ]);
  render(createElement(IngestDropzone, { courseId: null, onImported }));

  await userEvent.click(screen.getByRole('button', { name: '投进题目' }));

  expect(await screen.findByText('saved.pdf')).toBeVisible();
  expect(screen.getByText('disk full')).toBeVisible();
  expect(onImported).toHaveBeenCalledOnce();
});

test('does not report a completed ingest when every file fails', async () => {
  const onImported = vi.fn();
  vi.mocked(open).mockResolvedValue('failed.pdf');
  vi.mocked(importFiles).mockResolvedValue([{ sourcePath: 'failed.pdf', item: null, error: 'disk full' }]);
  render(createElement(IngestDropzone, { courseId: 'macro', onImported }));

  await userEvent.click(screen.getByRole('button', { name: '投进题目' }));

  expect(await screen.findByText('disk full')).toBeVisible();
  expect(onImported).not.toHaveBeenCalled();
});
