const PLACEHOLDER_PATTERN = /\{(\w+)\}/g;

export class TemplateRenderError extends Error {
  constructor(placeholders) {
    const missingPlaceholders = Array.isArray(placeholders)
      ? placeholders
      : [placeholders];
    super(`Missing template values: ${missingPlaceholders.join(", ")}`);
    this.name = "TemplateRenderError";
    this.placeholders = missingPlaceholders;
  }
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function findUnresolvedPlaceholders(value) {
  const placeholders = new Set();
  for (const match of String(value || "").matchAll(PLACEHOLDER_PATTERN)) {
    placeholders.add(match[1]);
  }
  return [...placeholders];
}

export function renderTemplate(template, replacements = {}, options = {}) {
  const strict = options.strict !== false;
  const shouldEscape = options.escape !== false;
  const fallbackValue = options.fallbackValue ?? "";
  const missingPlaceholders = findUnresolvedPlaceholders(template).filter(
    (key) =>
      !Object.hasOwn(replacements, key) ||
      replacements[key] === undefined ||
      replacements[key] === null,
  );

  if (strict && missingPlaceholders.length) {
    throw new TemplateRenderError(missingPlaceholders);
  }

  return String(template || "").replace(
    PLACEHOLDER_PATTERN,
    (_placeholder, key) => {
      const value =
        Object.hasOwn(replacements, key) &&
        replacements[key] !== undefined &&
        replacements[key] !== null
          ? replacements[key]
          : fallbackValue;
      return shouldEscape ? escapeHtml(value) : String(value);
    },
  );
}
