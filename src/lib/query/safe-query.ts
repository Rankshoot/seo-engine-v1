/**
 * Sanitizes and standardizes database error messages to prevent exposing internal PostgreSQL details to the frontend.
 */
export function sanitizeDatabaseError(errorMsg: string | undefined | null): string {
  if (!errorMsg) return "An unexpected error occurred.";

  const lower = errorMsg.toLowerCase();
  
  // Identify common database metadata, table/column names, postgres syntax, or constraint keywords
  const isDbError = 
    lower.includes("violates") ||
    lower.includes("constraint") ||
    lower.includes("duplicate key") ||
    lower.includes("foreign key") ||
    lower.includes("relation") ||
    lower.includes("table") ||
    lower.includes("column") ||
    lower.includes("postgresql") ||
    lower.includes("postgrest") ||
    lower.includes("sql state") ||
    lower.includes("syntax error") ||
    lower.includes("uuid") ||
    lower.includes("pg_") ||
    lower.includes("select") ||
    lower.includes("insert") ||
    lower.includes("update") ||
    lower.includes("delete") ||
    lower.includes("query");

  if (isDbError) {
    return "A database error occurred. Please contact support if the issue persists.";
  }

  return errorMsg;
}

/**
 * A generic try/catch wrapper that executes an API or query function and standardizes database error reporting
 * rather than leaking raw PostgreSQL errors to the frontend.
 */
export async function executeSafeQuery<T>(
  queryFn: () => Promise<T>
): Promise<T> {
  try {
    const result = await queryFn();
    
    // If the result matches standard response format { success: false, error: string }, intercept and sanitize
    if (
      result &&
      typeof result === "object" &&
      "success" in result &&
      result.success === false &&
      "error" in result &&
      typeof result.error === "string"
    ) {
      return {
        ...result,
        error: sanitizeDatabaseError(result.error),
      };
    }
    
    return result;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[Query Error Intercepted]:", err);
    throw new Error(sanitizeDatabaseError(message));
  }
}
