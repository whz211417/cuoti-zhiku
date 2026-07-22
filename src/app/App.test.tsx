import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from './App';

test('renders the local library shell', () => {
  render(<App />);
  expect(screen.getByRole('application', { name: '错题智库' })).toBeVisible();
});

test('switches from the inbox to focused review from the sidebar', async () => {
  const user = userEvent.setup();
  render(<App />);

  await user.click(screen.getByRole('button', { name: '今日复习' }));

  expect(screen.getByRole('heading', { name: '今日复习' })).toBeVisible();
});

test('returns to the inbox from the focused review workspace', async () => {
  const user = userEvent.setup();
  render(<App />);

  await user.click(screen.getByRole('button', { name: '今日复习' }));
  await user.click(screen.getByRole('button', { name: '收件箱 本地' }));

  expect(screen.getByRole('heading', { name: '收件箱' })).toBeVisible();
});

test('opens the preferences inspector from the toolbar', async () => {
  const user = userEvent.setup();
  render(<App />);

  await user.click(screen.getByRole('button', { name: '设置' }));

  expect(screen.getByRole('dialog', { name: '偏好设置' })).toBeVisible();
});
