import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { StrictMode } from 'react';
import { beforeEach, expect, test, vi } from 'vitest';
import { MaterialsLibrary } from './MaterialsLibrary';

const { importCourseMaterialFile, open, saveCourseMaterial, searchCourseMaterial } = vi.hoisted(() => ({
  importCourseMaterialFile: vi.fn(),
  open: vi.fn(),
  saveCourseMaterial: vi.fn(),
  searchCourseMaterial: vi.fn(),
}));
vi.mock('@tauri-apps/plugin-dialog', () => ({ open }));
vi.mock('../../lib/tauri', () => ({ importCourseMaterialFile, saveCourseMaterial, searchCourseMaterial }));

beforeEach(() => vi.clearAllMocks());

test('stores pasted course material locally before making it searchable', async () => {
  const user = userEvent.setup();
  const onSaved = vi.fn();
  saveCourseMaterial.mockResolvedValue({ id: 'material-1', courseId: 'macro', filename: 'IS-LM 讲义.md' });
  render(<MaterialsLibrary courseId="macro" onSaved={onSaved} />);

  await user.type(screen.getByLabelText('材料名称'), 'IS-LM 讲义.md');
  await user.type(screen.getByLabelText('材料正文'), '货币供给增加会使 LM 曲线向右移动。');
  await user.click(screen.getByRole('button', { name: '保存为本地依据' }));

  expect(saveCourseMaterial).toHaveBeenCalledWith('macro', 'IS-LM 讲义.md', '货币供给增加会使 LM 曲线向右移动。');
  expect(await screen.findByText('已保存到本课程资料库。')).toBeVisible();
  expect(onSaved).toHaveBeenCalledOnce();
});

test('shows only locally matched snippets for the selected course', async () => {
  const user = userEvent.setup();
  searchCourseMaterial.mockResolvedValue([{ materialId: 'material-1', filename: 'IS-LM 讲义.md', excerpt: '货币供给增加会使 LM 曲线向右移动。' }]);
  render(<MaterialsLibrary courseId="macro" />);

  await user.type(screen.getByLabelText('检索课程资料'), 'LM 曲线');
  await user.click(screen.getByRole('button', { name: '检索' }));

  expect(searchCourseMaterial).toHaveBeenCalledWith('macro', 'LM 曲线');
  expect(await screen.findByText('货币供给增加会使 LM 曲线向右移动。')).toBeVisible();
});

test('imports a selected PDF into the active course without pasting its text', async () => {
  const user = userEvent.setup();
  const onSaved = vi.fn();
  open.mockResolvedValue('C:/教材/宏观经济学第六章.pdf');
  importCourseMaterialFile.mockResolvedValue({
    id: 'material-pdf',
    courseId: 'macro',
    filename: '宏观经济学第六章.pdf',
  });
  render(<MaterialsLibrary courseId="macro" onSaved={onSaved} />);

  await user.click(screen.getByRole('button', { name: '导入 PDF 或讲义' }));

  expect(open).toHaveBeenCalledWith(expect.objectContaining({ multiple: false }));
  expect(importCourseMaterialFile).toHaveBeenCalledWith('macro', 'C:/教材/宏观经济学第六章.pdf');
  expect(await screen.findByText('已从文件提取文字并保存到本课程。')).toBeVisible();
  expect(onSaved).toHaveBeenCalledOnce();
});

test('runs each non-empty initial query once after a course is selected', async () => {
  searchCourseMaterial.mockResolvedValue([]);
  const view = render(<MaterialsLibrary courseId={null} initialQuery="LM 曲线" />);

  expect(searchCourseMaterial).not.toHaveBeenCalled();
  view.rerender(<MaterialsLibrary courseId="macro" initialQuery="LM 曲线" />);
  await waitFor(() => expect(searchCourseMaterial).toHaveBeenCalledWith('macro', 'LM 曲线'));
  expect(screen.getByLabelText('检索课程资料')).toHaveValue('LM 曲线');
  expect(searchCourseMaterial).toHaveBeenCalledTimes(1);

  view.rerender(<MaterialsLibrary courseId="macro" initialQuery="LM 曲线" />);
  expect(searchCourseMaterial).toHaveBeenCalledTimes(1);
  view.rerender(<MaterialsLibrary courseId="macro" initialQuery="货币供给" />);
  await waitFor(() => expect(searchCourseMaterial).toHaveBeenCalledTimes(2));
  expect(searchCourseMaterial).toHaveBeenLastCalledWith('macro', '货币供给');

  view.rerender(<MaterialsLibrary courseId="micro" initialQuery="货币供给" />);
  await waitFor(() => expect(searchCourseMaterial).toHaveBeenCalledTimes(3));
  expect(searchCourseMaterial).toHaveBeenLastCalledWith('micro', '货币供给');
});

test('runs a selected course initial query exactly once in StrictMode', async () => {
  searchCourseMaterial.mockResolvedValue([]);

  render(
    <StrictMode>
      <MaterialsLibrary courseId="macro" initialQuery="LM 曲线" />
    </StrictMode>,
  );

  await waitFor(() => expect(searchCourseMaterial).toHaveBeenCalledTimes(1));
  expect(searchCourseMaterial).toHaveBeenCalledWith('macro', 'LM 曲线');
});

test('does not report a pasted material as saved when persistence fails', async () => {
  const user = userEvent.setup();
  const onSaved = vi.fn();
  saveCourseMaterial.mockRejectedValue(new Error('disk full'));
  render(<MaterialsLibrary courseId="macro" onSaved={onSaved} />);

  await user.type(screen.getByLabelText('材料名称'), '失败讲义.md');
  await user.type(screen.getByLabelText('材料正文'), '这段内容不会保存成功。');
  await user.click(screen.getByRole('button', { name: '保存为本地依据' }));

  expect(await screen.findByText('保存没有完成，请稍后重试。')).toBeVisible();
  expect(onSaved).not.toHaveBeenCalled();
});

test('preserves prior results and offers retry when a manual search fails', async () => {
  const user = userEvent.setup();
  searchCourseMaterial
    .mockResolvedValueOnce([{ materialId: 'material-1', filename: '旧结果.md', excerpt: '仍然可见的旧结果' }])
    .mockRejectedValueOnce(new Error('database busy'))
    .mockResolvedValueOnce([{ materialId: 'material-2', filename: '新结果.md', excerpt: '恢复后的新结果' }]);
  render(<MaterialsLibrary courseId="macro" />);

  const input = screen.getByLabelText('检索课程资料');
  await user.type(input, '旧查询');
  await user.click(screen.getByRole('button', { name: '检索' }));
  expect(await screen.findByText('仍然可见的旧结果')).toBeVisible();

  await user.clear(input);
  await user.type(input, '新查询');
  await user.click(screen.getByRole('button', { name: '检索' }));

  expect(await screen.findByRole('alert')).toHaveTextContent('资料检索没有完成');
  expect(screen.getByText('仍然可见的旧结果')).toBeVisible();
  await user.click(screen.getByRole('button', { name: '重试资料检索' }));
  expect(await screen.findByText('恢复后的新结果')).toBeVisible();
});

test('handles a rejected initial search and recovers through the inline retry', async () => {
  const user = userEvent.setup();
  searchCourseMaterial
    .mockRejectedValueOnce(new Error('initial search failed'))
    .mockResolvedValueOnce([{ materialId: 'material-3', filename: '恢复.md', excerpt: '初始检索恢复' }]);

  render(<MaterialsLibrary courseId="macro" initialQuery="初始查询" />);

  expect(await screen.findByRole('alert')).toHaveTextContent('资料检索没有完成');
  await user.click(screen.getByRole('button', { name: '重试资料检索' }));
  expect(await screen.findByText('初始检索恢复')).toBeVisible();
});
