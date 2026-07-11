export const PRODUCT_GROUP_MAX_LENGTH = 80;

export const PRODUCT_GROUP_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Product groups are exact, admin-assigned kebab-case keys. */
export function isValidProductGroup(value: string): boolean {
  return (
    value.length <= PRODUCT_GROUP_MAX_LENGTH && PRODUCT_GROUP_PATTERN.test(value)
  );
}

export function parseProductGroup(
  value: FormDataEntryValue | null
): { ok: true; value: string | null } | { ok: false } {
  const text = String(value ?? "").trim();
  if (text === "") return { ok: true, value: null };
  return isValidProductGroup(text)
    ? { ok: true, value: text }
    : { ok: false };
}
