import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, test, vi } from 'vitest';
import { AiProviderSettings } from './AiProviderSettings';

const {
  clearAiProviderKey,
  getAiCredentialMigrationStatus,
  hasAiProviderKey,
  retryAiCredentialMigration,
  saveAiProviderKey,
  testAiProvider,
} = vi.hoisted(() => ({
  clearAiProviderKey: vi.fn(),
  getAiCredentialMigrationStatus: vi.fn(),
  hasAiProviderKey: vi.fn(),
  retryAiCredentialMigration: vi.fn(),
  saveAiProviderKey: vi.fn(),
  testAiProvider: vi.fn(),
}));
const { loadAiProviderState, saveAiProviderState } = vi.hoisted(() => ({
  loadAiProviderState: vi.fn(),
  saveAiProviderState: vi.fn(),
}));

vi.mock('../../lib/tauri', () => ({
  clearAiProviderKey,
  getAiCredentialMigrationStatus,
  hasAiProviderKey,
  retryAiCredentialMigration,
  saveAiProviderKey,
  testAiProvider,
}));
vi.mock('./aiProviderStore', () => ({ loadAiProviderState, saveAiProviderState }));

beforeEach(() => {
  vi.clearAllMocks();
  loadAiProviderState.mockResolvedValue({ providers: [], activeProviderId: null });
  getAiCredentialMigrationStatus.mockResolvedValue('not_needed');
  hasAiProviderKey.mockResolvedValue(false);
  saveAiProviderState.mockResolvedValue(undefined);
  saveAiProviderKey.mockResolvedValue(undefined);
  clearAiProviderKey.mockResolvedValue(undefined);
  testAiProvider.mockResolvedValue({ authenticated: true, modelAvailable: true, visionDeclared: false });
});

test('saves a preset key without ever echoing it back into the editor', async () => {
  const user = userEvent.setup();
  render(<AiProviderSettings />);

  await user.click(await screen.findByRole('button', { name: /DeepSeek/ }));
  await user.type(screen.getByLabelText('API Key'), 'secret-value');
  await user.click(screen.getByRole('button', { name: '安全保存 Key' }));

  await waitFor(() => expect(saveAiProviderKey).toHaveBeenCalledWith('deepseek', 'secret-value'));
  expect(screen.getByLabelText('API Key')).toHaveValue('');
  expect(screen.queryByDisplayValue('secret-value')).not.toBeInTheDocument();
});

test('keeps the last usable configuration active after a failed connection test', async () => {
  const user = userEvent.setup();
  loadAiProviderState.mockResolvedValue({
    providers: [{
      id: 'deepseek', displayName: 'DeepSeek', baseUrl: 'https://api.deepseek.com', selectedModel: 'deepseek-v4-flash',
      visionModel: null, supportsVision: false, requestTimeoutSeconds: 60, isEnabled: true, preset: 'deepseek', allowInsecureLocalhost: false,
    }],
    activeProviderId: 'deepseek',
  });
  testAiProvider.mockRejectedValue(new Error('模型不存在'));
  render(<AiProviderSettings />);

  await user.click(await screen.findByRole('button', { name: /DeepSeek/ }));
  await user.click(screen.getByRole('button', { name: '测试连接' }));

  expect(await screen.findByRole('alert')).toHaveTextContent('模型不存在');
  expect(saveAiProviderState).not.toHaveBeenCalledWith(expect.objectContaining({ activeProviderId: 'broken' }));
});

test('requires explicit acknowledgement before custom localhost HTTP can be persisted', async () => {
  const user = userEvent.setup();
  render(<AiProviderSettings />);

  await user.click(await screen.findByRole('button', { name: '自定义兼容平台' }));
  const url = screen.getByLabelText('兼容 API 地址');
  await user.clear(url);
  await user.type(url, 'http://localhost:11434/v1');
  await user.type(screen.getByLabelText('模型 ID'), 'qwen-local');
  expect(screen.getByText(/http:\/\/localhost:11434/)).toBeVisible();
  expect(screen.getByRole('button', { name: '保存平台设置' })).toBeDisabled();

  await user.click(screen.getByLabelText(/允许仅此本机地址使用 HTTP/));
  await user.click(screen.getByRole('button', { name: '保存平台设置' }));

  await waitFor(() => expect(saveAiProviderState).toHaveBeenCalledWith(expect.objectContaining({
    providers: [expect.objectContaining({ allowInsecureLocalhost: true, baseUrl: 'http://localhost:11434/v1' })],
  })));
});

test('invalidates a successful test result when the selected model changes', async () => {
  const user = userEvent.setup();
  hasAiProviderKey.mockResolvedValue(true);
  render(<AiProviderSettings />);
  await user.click(await screen.findByRole('button', { name: /DeepSeek/ }));
  await user.click(screen.getByRole('button', { name: '测试连接' }));
  expect(await screen.findByText('连接可用')).toBeVisible();
  expect(screen.getByRole('button', { name: '设为当前' })).toBeEnabled();

  await user.selectOptions(screen.getByLabelText('推荐模型'), 'deepseek-v4-pro');
  expect(screen.getByRole('button', { name: '设为当前' })).toBeDisabled();
});

test('ignores an in-flight connection result after the form changes', async () => {
  let resolveTest!: (result: { authenticated: boolean; modelAvailable: boolean; visionDeclared: boolean }) => void;
  testAiProvider.mockReturnValue(new Promise((resolve) => { resolveTest = resolve; }));
  const user = userEvent.setup();
  render(<AiProviderSettings />);

  await user.click(await screen.findByRole('button', { name: /DeepSeek/ }));
  await user.click(screen.getByRole('button', { name: '测试连接' }));
  await user.selectOptions(screen.getByLabelText('推荐模型'), 'deepseek-v4-pro');
  resolveTest({ authenticated: true, modelAvailable: true, visionDeclared: false });

  await waitFor(() => expect(screen.getByRole('button', { name: '测试连接' })).toBeEnabled());
  expect(screen.queryByText('连接可用')).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: '设为当前' })).toBeDisabled();
});
