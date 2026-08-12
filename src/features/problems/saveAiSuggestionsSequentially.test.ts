import { expect, test, vi } from 'vitest';
import { saveAiSuggestionsSequentially } from './saveAiSuggestionsSequentially';

const suggestions = [
  { kind: 'standard_answer', value: '答案' },
  { kind: 'explanation', value: '解析' },
];

test('passes each returned version into the next suggestion save', async () => {
  const persist = vi.fn()
    .mockResolvedValueOnce({ kind: 'standard_answer', value: '答案', version: 'v2', updatedAt: 't2' })
    .mockResolvedValueOnce({ kind: 'explanation', value: '解析', version: 'v3', updatedAt: 't3' });
  const onSaved = vi.fn();

  const result = await saveAiSuggestionsSequentially(suggestions, 'v1', persist, onSaved);

  expect(persist).toHaveBeenNthCalledWith(1, suggestions[0], 'v1');
  expect(persist).toHaveBeenNthCalledWith(2, suggestions[1], 'v2');
  expect(onSaved).toHaveBeenCalledTimes(2);
  expect(result).toEqual({ error: null, remainingSuggestions: [], savedSuggestions: suggestions });
});

test('returns completed and remaining suggestions after the first failure', async () => {
  const failure = new Error('conflict');
  const persist = vi.fn()
    .mockResolvedValueOnce({ kind: 'standard_answer', value: '答案', version: 'v2', updatedAt: 't2' })
    .mockRejectedValueOnce(failure);

  const result = await saveAiSuggestionsSequentially(suggestions, 'v1', persist, vi.fn());

  expect(result.savedSuggestions).toEqual([suggestions[0]]);
  expect(result.remainingSuggestions).toEqual([suggestions[1]]);
  expect(result.error).toBe(failure);
});
