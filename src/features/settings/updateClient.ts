import { getVersion } from '@tauri-apps/api/app';
import { check, type DownloadEvent } from '@tauri-apps/plugin-updater';

export type UpdateProgress = {
  downloaded: number;
  total: number | null;
};

export type UpdateDescriptor = {
  version: string;
  notes: string | null;
  downloadAndInstall(onProgress: (progress: UpdateProgress) => void): Promise<void>;
  close(): Promise<void>;
};

export type UpdateClient = {
  getCurrentVersion(): Promise<string>;
  check(): Promise<UpdateDescriptor | null>;
};

const normalizedNotes = (body: string | undefined) => {
  const notes = body?.trim();
  return notes ? notes : null;
};

export const nativeUpdateClient: UpdateClient = {
  getCurrentVersion: getVersion,
  async check() {
    const update = await check();
    if (!update) return null;

    return {
      version: update.version,
      notes: normalizedNotes(update.body),
      async downloadAndInstall(onProgress) {
        let downloaded = 0;
        let total: number | null = null;

        const handleProgress = (event: DownloadEvent) => {
          if (event.event === 'Started') {
            total = event.data.contentLength ?? null;
            onProgress({ downloaded, total });
          } else if (event.event === 'Progress') {
            downloaded += event.data.chunkLength;
            onProgress({ downloaded, total });
          }
        };

        await update.downloadAndInstall(handleProgress, { restartAfterInstall: true });
      },
      close: () => update.close(),
    };
  },
};
