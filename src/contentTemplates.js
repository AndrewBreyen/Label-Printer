import { useCallback, useEffect, useState } from 'react';

const STORAGE_KEY = 'labelContentTemplates';

export function useContentTemplates() {
  const [templates, setTemplates] = useState(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(templates));
    } catch {
      // Saved presets remain available for the current session if storage is unavailable.
    }
  }, [templates]);

  const saveTemplate = useCallback((name, content) => {
    setTemplates((previous) => [
      ...previous.filter((template) => template.name !== name),
      { name, ...content },
    ]);
  }, []);

  const deleteTemplate = useCallback((name) => {
    setTemplates((previous) => previous.filter((template) => template.name !== name));
  }, []);

  return { templates, saveTemplate, deleteTemplate };
}
