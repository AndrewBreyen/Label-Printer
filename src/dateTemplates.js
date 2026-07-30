/**
 * dateTemplates.js
 * ----------------
 * Templates whose content is a LIVE date/time computation rather
 * than a fixed saved string (see contentTemplates.js for those).
 * Each one generates a title/subtitle pair using the current
 * date/time at the moment it's applied — e.g. a food-prep label
 * with a "PREP" timestamp and a "USE BY" timestamp N days later.
 */

function formatDateTime(date) {
  // Compact format that fits a small label: "7/29 2:30 PM"
  const datePart = date.toLocaleDateString('en-US', { month: 'numeric', day: 'numeric' });
  const timePart = date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  return `${datePart} ${timePart}`;
}

export const DATE_TEMPLATES = {
  'Prep / Use By (7 days)': {
    generate: () => {
      const now = new Date();
      const useBy = new Date(now);
      useBy.setDate(useBy.getDate() + 7);
      return {
        title: `PREP: ${formatDateTime(now)}`,
        subtitle: `USE BY: ${formatDateTime(useBy)}`,
      };
    },
  },
};
