import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, test, vi } from 'vitest';
import { AiSettings } from './AiSettings';

const { clearAiApiKey, hasAiApiKey, saveAiApiKey } = vi.hoisted(() => ({
  clearAiApiKey: vi.fn(),
  hasAiApiKey: vi.fn(),
  saveAiApiKey: vi.fn(),
}));
vi.mock('../../lib/tauri', () => ({ clearAiApiKey, hasAiApiKey, saveAiApiKey }));

test('stores the DashScope key through the native credential command and clears the input', async () => {
  hasAiApiKey.mockResolvedValue(false);
  saveAiApiKey.mockResolvedValue(undefined);
  const user = userEvent.setup();
  render(<AiSettings />);

  await user.type(screen.getByLabelText('阿里云百炼 API Key'), 'sk-user-secret');
  await user.click(screen.getByRole('button', { name: '安全保存 Key' }));

  expect(saveAiApiKey).toHaveBeenCalledWith('sk-user-secret');
  expect(screen.getByLabelText('阿里云百炼 API Key')).toHaveValue('');
  expect(await screen.findByText('已保存到 Windows 凭据管理器。')).toBeVisible();
});
