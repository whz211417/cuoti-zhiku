import { save } from '@tauri-apps/plugin-dialog';
import { exportProblemBook } from '../../lib/tauri';

export type BookKind = 'questions' | 'answers';

const bookDetails: Record<BookKind, { filename: string; includeAnswers: boolean }> = {
  questions: { filename: '错题智库-题目册.md', includeAnswers: false },
  answers: { filename: '错题智库-答案解析册.md', includeAnswers: true },
};

export async function saveProblemBook(kind: BookKind): Promise<{ cancelled: boolean; problemCount: number }> {
  const details = bookDetails[kind];
  const destination = await save({
    defaultPath: details.filename,
    filters: [{ name: 'Markdown 文稿', extensions: ['md'] }],
  });
  if (!destination) return { cancelled: true, problemCount: 0 };

  const result = await exportProblemBook(destination, details.includeAnswers);
  return { cancelled: false, problemCount: result.problemCount };
}
