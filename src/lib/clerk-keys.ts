/**
 * Checks if the Clerk publishable key is present and has a valid format.
 * Clerk publishable keys start with 'pk_test_' or 'pk_live_' and must have a valid suffix.
 * A dummy placeholder like 'pk_test_dummy' is not valid.
 */
export function isClerkKeyValid(key?: string): boolean {
  if (!key) return false;
  const trimmed = key.trim();
  if (trimmed === "pk_test_dummy" || trimmed === "") return false;
  return (
    (trimmed.startsWith("pk_test_") || trimmed.startsWith("pk_live_")) &&
    trimmed.length > 15
  );
}
