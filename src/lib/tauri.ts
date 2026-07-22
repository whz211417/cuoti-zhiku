import { invoke } from '@tauri-apps/api/core';

export type LibraryHealth = {
  schemaVersion: number;
  foreignKeysEnabled: boolean;
  journalMode: string;
};

export const getLibraryHealth = () => invoke<LibraryHealth>('get_library_health');
