import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { UpdateState } from './useUpdateController';
import { UpdatePanel } from './UpdatePanel';

const renderPanel = (state: UpdateState, hasUnsavedProblemDraft = false) => {
  const onCheck = vi.fn();
  const onInstall = vi.fn();
  render(<UpdatePanel hasUnsavedProblemDraft={hasUnsavedProblemDraft} onCheck={onCheck} onInstall={onInstall} state={state} />);
  return { onCheck, onInstall };
};

describe('UpdatePanel', () => {
  it('shows the installed version and checks manually', () => {
    const { onCheck } = renderPanel({ status: 'idle', currentVersion: '0.5.1', lastCheckedAt: null });

    expect(screen.getByText('当前版本 0.5.1')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: '检查更新' }));
    expect(onCheck).toHaveBeenCalledOnce();
  });

  it('reports the current version without a disruptive success alert', () => {
    renderPanel({ status: 'current', currentVersion: '0.5.1', lastCheckedAt: '2026-09-20T12:00:00.000Z' });

    expect(screen.getByText('已是最新版本')).toBeVisible();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('shows release notes and installs only after an explicit click', () => {
    const { onInstall } = renderPanel({
      status: 'available', currentVersion: '0.5.1', nextVersion: '0.5.2', notes: '更顺手的更新体验', lastCheckedAt: '2026-09-20T12:00:00.000Z',
    });

    expect(screen.getByText('发现新版本 0.5.2')).toBeVisible();
    expect(screen.getByText('更顺手的更新体验')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: '下载并安装 0.5.2' }));
    expect(onInstall).toHaveBeenCalledOnce();
  });

  it('blocks installation while a problem draft is unsaved', () => {
    const { onInstall } = renderPanel({
      status: 'available', currentVersion: '0.5.1', nextVersion: '0.5.2', notes: null, lastCheckedAt: '2026-09-20T12:00:00.000Z',
    }, true);

    expect(screen.getByText('请先保存正在编辑的题目')).toBeVisible();
    const install = screen.getByRole('button', { name: '下载并安装 0.5.2' });
    expect(install).toBeDisabled();
    fireEvent.click(install);
    expect(onInstall).not.toHaveBeenCalled();
  });

  it('renders determinate and indeterminate download progress', () => {
    const { rerender } = render(<UpdatePanel
      hasUnsavedProblemDraft={false}
      onCheck={vi.fn()}
      onInstall={vi.fn()}
      state={{ status: 'downloading', currentVersion: '0.5.1', nextVersion: '0.5.2', progress: { downloaded: 40, total: 100 } }}
    />);

    expect(screen.getByRole('progressbar')).toHaveAttribute('value', '40');
    expect(screen.getByText('正在下载 40%')).toBeVisible();
    rerender(<UpdatePanel
      hasUnsavedProblemDraft={false}
      onCheck={vi.fn()}
      onInstall={vi.fn()}
      state={{ status: 'downloading', currentVersion: '0.5.1', nextVersion: '0.5.2', progress: { downloaded: 12, total: null } }}
    />);
    expect(screen.getByRole('progressbar')).not.toHaveAttribute('value');
    expect(screen.getByText('正在安全下载更新…')).toBeVisible();
  });

  it('keeps network failures retryable', () => {
    const { onCheck } = renderPanel({ status: 'error', currentVersion: '0.5.1', message: '暂时无法检查更新，请稍后重试。', lastCheckedAt: null });

    expect(screen.getByRole('alert')).toHaveTextContent('暂时无法检查更新，请稍后重试。');
    fireEvent.click(screen.getByRole('button', { name: '重试检查' }));
    expect(onCheck).toHaveBeenCalledOnce();
  });
});
