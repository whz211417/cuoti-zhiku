import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, test, vi } from 'vitest';
import { ReviewReader } from './ReviewReader';

test('keeps the answer hidden until the user explicitly reveals it', async () => {
  const user = userEvent.setup();
  render(<ReviewReader explanation="财政扩张会提高总需求。" ownAnswer="我认为 IS 会右移。" standardAnswer="IS 曲线右移。" stem="财政扩张如何影响 IS 曲线？" />);

  expect(screen.queryByText('IS 曲线右移。')).not.toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: '显示答案' }));

  expect(screen.getByText('IS 曲线右移。')).toBeVisible();
  expect(screen.getByText('财政扩张会提高总需求。')).toBeVisible();
});

test('submits a grade only after the answer is revealed', async () => {
  const user = userEvent.setup();
  const onGrade = vi.fn();
  render(<ReviewReader onGrade={onGrade} stem="测试题" />);

  expect(screen.queryByRole('button', { name: '熟悉' })).not.toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: '显示答案' }));
  await user.click(screen.getByRole('button', { name: '熟悉' }));

  expect(onGrade).toHaveBeenCalledWith('familiar');
});

test('can defer or end a review without grading the problem', async () => {
  const user = userEvent.setup();
  const onDefer = vi.fn();
  const onEnd = vi.fn();
  const onGrade = vi.fn();
  render(<ReviewReader onDefer={onDefer} onEnd={onEnd} onGrade={onGrade} stem="测试题" />);

  await user.click(screen.getByRole('button', { name: '稍后再看' }));
  await user.click(screen.getByRole('button', { name: '结束本次' }));

  expect(onDefer).toHaveBeenCalledOnce();
  expect(onEnd).toHaveBeenCalledOnce();
  expect(onGrade).not.toHaveBeenCalled();
});

test('hides the previous answer when the reader advances to a new question', async () => {
  const user = userEvent.setup();
  const { rerender } = render(<ReviewReader standardAnswer="第一题答案" stem="第一题题干" />);

  await user.click(screen.getByRole('button', { name: '显示答案' }));
  expect(screen.getByText('第一题答案')).toBeVisible();

  rerender(<ReviewReader standardAnswer="第二题答案" stem="第二题题干" />);

  expect(screen.queryByText('第二题答案')).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: '显示答案' })).toBeVisible();
});

test('disables every grade while persistence is in flight and exposes an inline retry after failure', async () => {
  const user = userEvent.setup();
  const onGrade = vi.fn();
  const onRetry = vi.fn();
  const view = render(<ReviewReader isGrading onGrade={onGrade} stem="测试题" />);

  await user.click(screen.getByRole('button', { name: '显示答案' }));
  const gradeButtons = screen.getAllByRole('button', { name: /忘记|困难|熟悉|掌握/ });
  expect(gradeButtons).toHaveLength(4);
  gradeButtons.forEach((button) => expect(button).toBeDisabled());

  view.rerender(
    <ReviewReader
      gradeError="评分没有保存，请重试。"
      onGrade={onGrade}
      onRetry={onRetry}
      stem="测试题"
    />,
  );

  expect(screen.getByRole('alert')).toHaveTextContent('评分没有保存，请重试。');
  await user.click(screen.getByRole('button', { name: '重新保存评分' }));
  expect(onRetry).toHaveBeenCalledOnce();
});

test('shows review position and supports the reveal-and-grade keyboard flow', () => {
  const onGrade = vi.fn();
  render(<ReviewReader onGrade={onGrade} position={2} standardAnswer="答案" stem="测试题" total={6} />);

  expect(screen.getByText('第 2 / 6 道')).toBeVisible();
  expect(screen.getByRole('progressbar', { name: '复习进度' })).toHaveAttribute('aria-valuenow', '2');

  fireEvent.keyDown(window, { code: 'Space' });
  expect(screen.getByText('答案')).toBeVisible();

  fireEvent.keyDown(window, { key: '3' });
  expect(onGrade).toHaveBeenCalledWith('familiar');
});

test('ignores unsafe or stale review shortcuts', () => {
  const onGrade = vi.fn();
  const view = render(<ReviewReader onGrade={onGrade} standardAnswer="答案" stem="测试题" />);

  fireEvent.keyDown(window, { code: 'Space', ctrlKey: true });
  expect(screen.queryByText('答案')).not.toBeInTheDocument();
  fireEvent.keyDown(window, { code: 'Space', repeat: true });
  expect(screen.queryByText('答案')).not.toBeInTheDocument();

  const input = document.createElement('input');
  document.body.append(input);
  input.focus();
  fireEvent.keyDown(input, { code: 'Space' });
  expect(screen.queryByText('答案')).not.toBeInTheDocument();
  input.remove();

  fireEvent.keyDown(window, { code: 'Space' });
  fireEvent.keyDown(window, { key: '3', repeat: true });
  expect(onGrade).not.toHaveBeenCalled();

  view.rerender(<ReviewReader isGrading onGrade={onGrade} standardAnswer="答案" stem="测试题" />);
  fireEvent.keyDown(window, { key: '3' });
  expect(onGrade).not.toHaveBeenCalled();

  view.unmount();
  fireEvent.keyDown(window, { key: '3' });
  expect(onGrade).not.toHaveBeenCalled();
});
