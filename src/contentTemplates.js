import { useCallback, useEffect, useState } from 'react';

const STORAGE_KEY = 'labelContentTemplates';

/**
 * Manages named label CONTENT presets — title, subtitle, font size,
 * and x/y position bundled together so a whole label layout can be
 * saved and reselected later. This is distinct from labelTemplates.js,
 * which handles physical label SIZE (width/height in px); this is
 * about the text/layout you put on a label of a given size.
 *
 * Persisted to localStorage so saved presets survive a page reload.
 *
 * NOTE: the exported function keeps the "useContentTemplates" name
 * (not just "contentTemplates") even though the file itself is now
 * named contentTemplates.js. It genuinely is a React hook internally
 * (uses useState/useEffect), and React's hooks linter relies on the
 * "use" prefix to correctly apply the rules of hooks — dropping it
 * would silence real lint protections, so only the filename changed.
 */
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
      // localStorage unavailable (e.g. private browsing) — presets
      // just won't persist across reloads, not worth surfacing an
      // error to the user for this.
    }
  }, [templates]);

  const saveTemplate = useCallback((name, content) => {
    setTemplates((prev) => {
      const withoutExisting = prev.filter((t) => t.name !== name);
      return [...withoutExisting, { name, ...content }];
    });
  }, []);

  const deleteTemplate = useCallback((name) => {
    setTemplates((prev) => prev.filter((t) => t.name !== name));
  }, []);

  return { templates, saveTemplate, deleteTemplate };
}