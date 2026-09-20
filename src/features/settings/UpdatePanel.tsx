import type { UpdateState } from './useUpdateController';

type UpdatePanelProps = {
  state: UpdateState;
  onCheck: () => void | Promise<void>;
  onInstall: () => void | Promise<void>;
  hasUnsavedProblemDraft: boolean;
};

const versionLabel = (version: string | null) => version ? `当前版本 ${version}` : '正在读取当前版本';

export function UpdatePanel({ state, onCheck, onInstall, hasUnsavedProblemDraft }: UpdatePanelProps) {
  const currentVersion = versionLabel(state.currentVersion);

  return (
    <section aria-label="关于与更新" className="update-panel">
      <div className="update-panel-copy">
        <strong>关于与更新</strong>
        <span>{currentVersion}</span>
      </div>

      {state.status === 'checking' ? (
        <div className="update-actions">
          <span aria-live="polite" className="update-state">正在检查更新…</span>
          <button disabled type="button">检查中…</button>
        </div>
      ) : null}

      {state.status === 'idle' ? <button onClick={() => void onCheck()} type="button">检查更新</button> : null}

      {state.status === 'current' ? (
        <div className="update-actions">
          <span aria-live="polite" className="update-state is-current">已是最新版本</span>
          <button onClick={() => void onCheck()} type="button">再次检查</button>
        </div>
      ) : null}

      {state.status === 'available' ? (
        <div className="update-available">
          <div>
            <span className="update-state">发现新版本 {state.nextVersion}</span>
            {state.notes ? <p>{state.notes}</p> : null}
            {hasUnsavedProblemDraft ? <p className="update-draft-warning">请先保存正在编辑的题目</p> : null}
          </div>
          <button aria-label={`下载并安装 ${state.nextVersion}`} disabled={hasUnsavedProblemDraft} onClick={() => void onInstall()} type="button">
            下载并安装
          </button>
        </div>
      ) : null}

      {state.status === 'downloading' ? (() => {
        const percent = state.progress.total && state.progress.total > 0
          ? Math.min(100, Math.round((state.progress.downloaded / state.progress.total) * 100))
          : null;
        return (
          <div aria-live="polite" className="update-progress-wrap">
            <span className="update-state">{percent === null ? '正在安全下载更新…' : `正在下载 ${percent}%`}</span>
            <progress max={100} value={percent ?? undefined} />
          </div>
        );
      })() : null}

      {state.status === 'error' ? (
        <div className="update-actions">
          <span className="update-error" role="alert">{state.message}</span>
          <button onClick={() => void onCheck()} type="button">重试检查</button>
        </div>
      ) : null}
    </section>
  );
}
