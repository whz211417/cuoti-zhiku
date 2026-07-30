import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, test, vi } from 'vitest';
import { saveProblemBook } from '../features/export/exportBooks';
import { App } from './App';

vi.mock('../features/export/exportBooks', () => ({ saveProblemBook: vi.fn() }));

beforeEach(() => vi.clearAllMocks());

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

test('exports the question book only after the user requests it from preferences', async () => {
  const user = userEvent.setup();
  vi.mocked(saveProblemBook).mockResolvedValue({ cancelled: false, problemCount: 2 });
  render(<App />);

  await user.click(screen.getByRole('button', { name: '设置' }));
  await user.click(screen.getByRole('button', { name: '导出题目册' }));

  expect(saveProblemBook).toHaveBeenCalledWith('questions');
  expect(await screen.findByText('已导出 2 道题目。')).toBeVisible();
});
