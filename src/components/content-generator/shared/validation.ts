export interface ValidationResult {
  isValid: boolean;
  error?: string;
}

/**
 * Validates the Ebook generator form fields.
 */
export function validateEbookForm(topic: string, primaryKeyword: string, audience: string): ValidationResult {
  if (!topic.trim()) {
    return { isValid: false, error: "Add a topic or use Ask AI." };
  }
  if (!primaryKeyword.trim()) {
    return { isValid: false, error: "Add the primary SEO keyword." };
  }
  if (!audience.trim()) {
    return { isValid: false, error: "Describe your target audience." };
  }
  return { isValid: true };
}

/**
 * Validates the Whitepaper generator form fields.
 */
export function validateWhitepaperForm(topic: string, primaryKeyword: string, problem: string): ValidationResult {
  if (!topic.trim()) {
    return { isValid: false, error: "Topic is required." };
  }
  if (!primaryKeyword.trim()) {
    return { isValid: false, error: "Primary keyword is required." };
  }
  if (!problem.trim()) {
    return { isValid: false, error: "Describe the problem this whitepaper solves." };
  }
  return { isValid: true };
}

/**
 * Validates the LinkedIn post generator form fields.
 */
export function validateLinkedInForm(topic: string, primaryKeyword: string): ValidationResult {
  if (!topic.trim()) {
    return { isValid: false, error: "Add a topic or use Ask AI." };
  }
  if (!primaryKeyword.trim()) {
    return { isValid: false, error: "Add the primary keyword." };
  }
  return { isValid: true };
}
