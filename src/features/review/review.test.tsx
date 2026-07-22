import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, test } from 'vitest';
import { ReviewReader } from './ReviewReader';

test('keeps the answer hidden until the user explicitly reveals it', async () => {
  const user = userEvent.setup();
  render(<ReviewReader explanation="财政扩张会提高总需求。" ownAnswer="我认为 IS 会右移。" standardAnswer="IS 曲线右移。" stem="财政扩张如何影响 IS 曲线？" />);

  expect(screen.queryByText('IS 曲线右移。')).not.toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: '显示答案' }));

  expect(screen.getByText('IS 曲线右移。')).toBeVisible();
  expect(screen.getByText('财政扩张会提高总需求。')).toBeVisible();
});
