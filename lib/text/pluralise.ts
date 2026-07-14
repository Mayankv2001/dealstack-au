/** Shared count copy so public labels cannot produce malformed "offer s" text. */
export function pluralise(
  count: number,
  singular: string,
  plural: string = `${singular}s`
): string {
  return `${count} ${count === 1 ? singular : plural}`;
}
