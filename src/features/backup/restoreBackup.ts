import { confirm, open } from '@tauri-apps/plugin-dialog';
import { restoreLibraryBackup } from '../../lib/tauri';

export type RestoreResult = {
  restored: boolean;
  rescuePath: string | null;
};

export async function restoreBackup(): Promise<RestoreResult> {
  const source = await open({
    multiple: false,
    filters: [{ name: '错题智库备份', extensions: ['czkbackup', 'sqlite3'] }],
  });
  if (typeof source !== 'string') return { restored: false, rescuePath: null };
  const approved = await confirm(
    '恢复会用所选备份替换当前题目、课程、复习记录和原件。应用会先自动保存一份当前完整资料库，确认继续吗？',
    { title: '恢复本地资料库', kind: 'warning' },
  );
  if (!approved) return { restored: false, rescuePath: null };
  return { restored: true, rescuePath: await restoreLibraryBackup(source) };
}
