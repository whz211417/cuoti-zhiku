import { render, screen } from '@testing-library/react';
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
