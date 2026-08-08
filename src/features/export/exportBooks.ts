import { save } from '@tauri-apps/plugin-dialog';
import { exportProblemBook, exportProblemBookHtml } from '../../lib/tauri';

export type BookKind = 'questions' | 'answers';
export type BookFormat = 'markdown' | 'print';

const bookDetails: Record<BookKind, { filename: string; includeAnswers: boolean }> = {
  questions: { filename: '错题智库-题目册.md', includeAnswers: false },
  answers: { filename: '错题智库-答案解析册.md', includeAnswers: true },
};

export async function saveProblemBook(kind: BookKind, format: BookFormat = 'markdown'): Promise<{ cancelled: boolean; problemCount: number }> {
  const details = bookDetails[kind];
  const printable = format === 'print';
  const destination = await save({
    defaultPath: printable ? details.filename.replace(/\.md$/, '-打印版.html') : details.filename,
    filters: printable
      ? [{ name: '可打印网页', extensions: ['html'] }]
      : [{ name: 'Markdown 文稿', extensions: ['md'] }],
  });
  if (!destination) return { cancelled: true, problemCount: 0 };

  const result = printable
    ? await exportProblemBookHtml(destination, details.includeAnswers)
    : await exportProblemBook(destination, details.includeAnswers);
  return { cancelled: false, problemCount: result.problemCount };
}
