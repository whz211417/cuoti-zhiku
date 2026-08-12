import type { AiFieldSuggestion } from '../../lib/tauri';

export type SavedSuggestionField = {
  kind: string;
  updatedAt: string;
  value: string;
  version: string;
};

type SaveSuggestionsResult = {
  error: unknown | null;
  remainingSuggestions: AiFieldSuggestion[];
  savedSuggestions: AiFieldSuggestion[];
};

export async function saveAiSuggestionsSequentially(
  suggestions: AiFieldSuggestion[],
  initialVersion: string,
  persist: (suggestion: AiFieldSuggestion, expectedVersion: string) => Promise<SavedSuggestionField>,
  onSaved: (field: SavedSuggestionField) => void,
): Promise<SaveSuggestionsResult> {
  const savedSuggestions: AiFieldSuggestion[] = [];
  let expectedVersion = initialVersion;

  for (let index = 0; index < suggestions.length; index += 1) {
    try {
      const saved = await persist(suggestions[index], expectedVersion);
      expectedVersion = saved.version;
      savedSuggestions.push(suggestions[index]);
      onSaved(saved);
    } catch (error) {
      return {
        error,
        remainingSuggestions: suggestions.slice(index),
        savedSuggestions,
      };
    }
  }

  return { error: null, remainingSuggestions: [], savedSuggestions };
}
