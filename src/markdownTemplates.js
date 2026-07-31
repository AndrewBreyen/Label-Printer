/**
 * markdownTemplates.js
 * --------------------
 * Label templates defined directly in code, as markdown (see
 * markdown.js for the syntax). This is the "make templates via
 * code" path — add a new label layout by adding an entry here, no
 * UI interaction needed. These are separate from user-saved
 * templates (contentTemplates.js), which are created through the
 * app's "Save current as template" button and persisted to
 * localStorage.
 */
export const MARKDOWN_TEMPLATES = {
  'Prep / Use By (7 days)': {
    markdown: `# PREP
{{now}}

## USE BY
{{now+7d}}`,
  },
  'Simple Label': {
    markdown: `# Hello World`,
  },
};
