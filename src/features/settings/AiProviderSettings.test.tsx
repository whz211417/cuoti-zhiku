import { StrictMode } from 'react';
import { act, render, screen, waitFor } from '@testing-library/react';
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

test('uses the native 10 to 180 second timeout contract and rejects out-of-range drafts', async () => {
  const user = userEvent.setup();
  render(<AiProviderSettings />);

  await user.click(await screen.findByRole('button', { name: '自定义兼容平台' }));
  const timeout = screen.getByLabelText('超时（秒）');
  expect(timeout).toHaveAttribute('min', '10');
  expect(timeout).toHaveAttribute('max', '180');
  await user.clear(screen.getByLabelText('兼容 API 地址'));
  await user.type(screen.getByLabelText('兼容 API 地址'), 'http://localhost:11434/v1');
  await user.type(screen.getByLabelText('模型 ID'), 'qwen-local');
  await user.click(screen.getByLabelText(/允许仅此本机地址使用 HTTP/));
  expect(screen.getByRole('button', { name: '保存平台设置' })).toBeEnabled();
  await user.clear(timeout);
  await user.type(timeout, '9');
  expect(screen.getByRole('button', { name: '保存平台设置' })).toBeDisabled();
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

test('locks editing after a store-load failure and recovers only after retry succeeds', async () => {
  loadAiProviderState.mockRejectedValueOnce(new Error('disk unavailable')).mockResolvedValueOnce({ providers: [], activeProviderId: null });
  const user = userEvent.setup();
  render(<AiProviderSettings />);

  expect(await screen.findByRole('alert')).toHaveTextContent('disk unavailable');
  expect(screen.getByRole('button', { name: /DeepSeek/ })).toBeDisabled();
  await user.click(screen.getByRole('button', { name: '重试读取' }));
  expect(await screen.findByLabelText('阿里云百炼 配置编辑器')).toBeVisible();
  expect(screen.queryByText('disk unavailable')).not.toBeInTheDocument();
});

test('preserves loaded settings when credential migration status rejects', async () => {
  getAiCredentialMigrationStatus.mockRejectedValue('migration unavailable');
  render(<AiProviderSettings />);

  expect(await screen.findByLabelText('阿里云百炼 配置编辑器')).toBeVisible();
  expect(await screen.findByText('旧版凭据迁移尚未完成，现有 Key 保持安全。')).toBeVisible();
});

test('requires a fresh connection test after replacing an API key', async () => {
  hasAiProviderKey.mockResolvedValue(true);
  const user = userEvent.setup();
  render(<AiProviderSettings />);
  await user.click(await screen.findByRole('button', { name: /DeepSeek/ }));
  await user.click(screen.getByRole('button', { name: '测试连接' }));
  expect(await screen.findByText('连接可用')).toBeVisible();
  await user.type(screen.getByLabelText('API Key'), 'replacement-key');
  await user.click(screen.getByRole('button', { name: '安全保存 Key' }));

  await waitFor(() => expect(saveAiProviderKey).toHaveBeenCalledWith('deepseek', 'replacement-key'));
  expect(screen.getByRole('button', { name: '设为当前' })).toBeDisabled();
});

test('does not allow a new custom provider to store a key before its config is persisted', async () => {
  const user = userEvent.setup();
  render(<AiProviderSettings />);
  await user.click(await screen.findByRole('button', { name: '自定义兼容平台' }));
  await user.type(screen.getByLabelText('API Key'), 'custom-key');

  expect(screen.getByRole('button', { name: '安全保存 Key' })).toBeDisabled();
});

test('shows string command failures without erasing the credential field for another provider', async () => {
  let resolveSave!: () => void;
  saveAiProviderKey.mockReturnValue(new Promise<void>((resolve) => { resolveSave = resolve; }));
  const user = userEvent.setup();
  render(<AiProviderSettings />);
  await user.click(await screen.findByRole('button', { name: /DeepSeek/ }));
  await user.type(screen.getByLabelText('API Key'), 'old-key');
  await user.click(screen.getByRole('button', { name: '安全保存 Key' }));
  await user.click(screen.getByRole('button', { name: /OpenAI/ }));
  await user.type(screen.getByLabelText('API Key'), 'new-key');
  await act(async () => { resolveSave(); });

  expect(screen.getByLabelText('API Key')).toHaveValue('new-key');
});

test('clearing the active provider key immediately deactivates and persists the selection', async () => {
  const deepseek = {
    id: 'deepseek', displayName: 'DeepSeek', baseUrl: 'https://api.deepseek.com', selectedModel: 'deepseek-v4-flash',
    visionModel: null, supportsVision: false, requestTimeoutSeconds: 60, isEnabled: true, preset: 'deepseek' as const, allowInsecureLocalhost: false,
  };
  loadAiProviderState.mockResolvedValue({ providers: [deepseek], activeProviderId: 'deepseek' });
  hasAiProviderKey.mockResolvedValue(true);
  const user = userEvent.setup();
  render(<AiProviderSettings />);

  await user.click(await screen.findByRole('button', { name: /DeepSeek/ }));
  await user.click(screen.getByRole('button', { name: '移除 Key' }));

  await waitFor(() => expect(clearAiProviderKey).toHaveBeenCalledWith('deepseek'));
  await waitFor(() => expect(saveAiProviderState).toHaveBeenCalledWith({
    providers: [{ ...deepseek, isEnabled: false }], activeProviderId: null,
  }));
  expect(screen.getByText(/尚未选择当前 AI 平台/)).toBeVisible();
});

test('ignores a stale has-key result after saving a provider key', async () => {
  let resolveOldHas!: (value: boolean) => void;
  const deepseek = {
    id: 'deepseek', displayName: 'DeepSeek', baseUrl: 'https://api.deepseek.com', selectedModel: 'deepseek-v4-flash',
    visionModel: null, supportsVision: false, requestTimeoutSeconds: 60, isEnabled: true, preset: 'deepseek' as const, allowInsecureLocalhost: false,
  };
  loadAiProviderState.mockResolvedValue({ providers: [deepseek], activeProviderId: 'deepseek' });
  hasAiProviderKey.mockImplementation((id: string) => id === 'deepseek'
    ? new Promise<boolean>((resolve) => { resolveOldHas = resolve; })
    : Promise.resolve(false));
  const user = userEvent.setup();
  render(<AiProviderSettings />);
  await user.click(await screen.findByRole('button', { name: /DeepSeek/ }));
  await user.type(screen.getByLabelText('API Key'), 'replacement-key');
  await user.click(screen.getByRole('button', { name: '安全保存 Key' }));
  await waitFor(() => expect(saveAiProviderKey).toHaveBeenCalled());
  await act(async () => { resolveOldHas(false); });

  expect(screen.getByText(/当前使用：DeepSeek/)).toBeVisible();
});

test('clearing an active key after switching editors still deactivates its captured provider', async () => {
  let resolveClear!: () => void;
  const deepseek = {
    id: 'deepseek', displayName: 'DeepSeek', baseUrl: 'https://api.deepseek.com', selectedModel: 'deepseek-v4-flash',
    visionModel: null, supportsVision: false, requestTimeoutSeconds: 60, isEnabled: true, preset: 'deepseek' as const, allowInsecureLocalhost: false,
  };
  loadAiProviderState.mockResolvedValue({ providers: [deepseek], activeProviderId: 'deepseek' });
  hasAiProviderKey.mockResolvedValue(true);
  clearAiProviderKey.mockReturnValue(new Promise<void>((resolve) => { resolveClear = resolve; }));
  const user = userEvent.setup();
  render(<AiProviderSettings />);
  await user.click(await screen.findByRole('button', { name: /DeepSeek/ }));
  await user.click(screen.getByRole('button', { name: '移除 Key' }));
  await user.click(screen.getByRole('button', { name: /OpenAI/ }));
  await act(async () => { resolveClear(); });

  await waitFor(() => expect(saveAiProviderState).toHaveBeenCalledWith({ providers: [{ ...deepseek, isEnabled: false }], activeProviderId: null }));
  expect(screen.getByLabelText('OpenAI 配置编辑器')).toBeVisible();
  expect(screen.queryByText('已从 Windows 凭据管理器移除 Key。')).not.toBeInTheDocument();
});

test('StrictMode schedules one persisted missing-key repair for an active provider', async () => {
  const deepseek = {
    id: 'deepseek', displayName: 'DeepSeek', baseUrl: 'https://api.deepseek.com', selectedModel: 'deepseek-v4-flash',
    visionModel: null, supportsVision: false, requestTimeoutSeconds: 60, isEnabled: true, preset: 'deepseek' as const, allowInsecureLocalhost: false,
  };
  loadAiProviderState.mockResolvedValue({ providers: [deepseek], activeProviderId: 'deepseek' });
  hasAiProviderKey.mockResolvedValue(false);
  render(<StrictMode><AiProviderSettings /></StrictMode>);

  await waitFor(() => expect(saveAiProviderState).toHaveBeenCalledWith({ providers: [{ ...deepseek, isEnabled: false }], activeProviderId: null }));
  expect(saveAiProviderState).toHaveBeenCalledTimes(1);
});

test('serializes automatic missing-key repair before a newer provider selection without overwriting it', async () => {
  let resolveHasDeepseek!: (value: boolean) => void;
  let resolveRepair!: () => void;
  let inFlightWrites = 0;
  let maxInFlightWrites = 0;
  const deepseek = {
    id: 'deepseek', displayName: 'DeepSeek', baseUrl: 'https://api.deepseek.com', selectedModel: 'deepseek-v4-flash',
    visionModel: null, supportsVision: false, requestTimeoutSeconds: 60, isEnabled: true, preset: 'deepseek' as const, allowInsecureLocalhost: false,
  };
  loadAiProviderState.mockResolvedValue({ providers: [deepseek], activeProviderId: 'deepseek' });
  hasAiProviderKey.mockImplementation((id: string) => id === 'deepseek'
    ? new Promise<boolean>((resolve) => { resolveHasDeepseek = resolve; })
    : Promise.resolve(true));
  saveAiProviderState.mockImplementation(() => {
    inFlightWrites += 1;
    maxInFlightWrites = Math.max(maxInFlightWrites, inFlightWrites);
    if (saveAiProviderState.mock.calls.length === 1) {
      return new Promise<void>((resolve) => { resolveRepair = () => { inFlightWrites -= 1; resolve(); }; });
    }
    inFlightWrites -= 1;
    return Promise.resolve();
  });
  const user = userEvent.setup();
  render(<AiProviderSettings />);

  await waitFor(() => expect(hasAiProviderKey).toHaveBeenCalledWith('deepseek'));
  await act(async () => { resolveHasDeepseek(false); });
  await waitFor(() => expect(saveAiProviderState).toHaveBeenCalledTimes(1));
  await user.click(screen.getByRole('button', { name: /OpenAI/ }));
  await waitFor(() => expect(screen.getByRole('button', { name: '测试连接' })).toBeEnabled());
  await user.click(screen.getByRole('button', { name: '测试连接' }));
  await user.click(await screen.findByRole('button', { name: '设为当前' }));

  await act(async () => { resolveRepair(); });
  await waitFor(() => expect(saveAiProviderState).toHaveBeenCalledTimes(2));
  const finalSavedState = saveAiProviderState.mock.calls.at(-1)?.[0];
  expect(finalSavedState).toEqual(expect.objectContaining({
    activeProviderId: 'openai',
    providers: expect.arrayContaining([
      expect.objectContaining({ id: 'deepseek', isEnabled: false }),
      expect.objectContaining({ id: 'openai', isEnabled: true }),
    ]),
  }));
  expect(finalSavedState.providers.filter((provider: { isEnabled: boolean }) => provider.isEnabled).map((provider: { id: string }) => provider.id)).toEqual(['openai']);
  expect(maxInFlightWrites).toBe(1);
  expect(screen.getByText(/当前使用：OpenAI/)).toBeVisible();
});

test('uses a catalog vision model when a preset text model is selected', async () => {
  hasAiProviderKey.mockResolvedValue(true);
  const user = userEvent.setup();
  render(<AiProviderSettings />);
  await user.click(await screen.findByRole('button', { name: /智谱/ }));
  await user.selectOptions(screen.getByLabelText('推荐模型'), 'glm-5.2');
  await user.click(screen.getByRole('button', { name: '测试连接' }));

  await waitFor(() => expect(testAiProvider).toHaveBeenCalledWith(expect.objectContaining({ selectedModel: 'glm-5.2', visionModel: 'glm-4.5v', supportsVision: true })));
});
