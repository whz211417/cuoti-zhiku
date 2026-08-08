import { save } from '@tauri-apps/plugin-dialog';
import { createLibraryBackup, type CompleteBackupReport } from '../../lib/tauri';

export async function createBackup(): Promise<CompleteBackupReport | null> {
  const destination = await save({ defaultPath: '错题智库-完整备份.czkbackup', filters: [{ name: '错题智库完整备份', extensions: ['czkbackup'] }] });
  if (!destination) return null;
  return createLibraryBackup(destination);
}
