type T = (key: string, values?: Record<string, string | number>) => string;

/** "min:3" → t("min", {min: 3}); "range:1:100" → t("range", {min:1, max:100}); "required" → t("required"). */
export function validationText(t: T, code: string): string {
  const [name = "generic", a = "", b = ""] = code.split(":");
  switch (name) {
    case "min": return t("min", { min: a });
    case "max": return t("max", { max: a });
    case "range": return t("range", { min: a, max: b });
    default: return t(name);
  }
}

/** Service failure codes → validation message keys. */
export function serviceErrorKey(code: string): string {
  switch (code) {
    case "EMAIL_TAKEN": return "emailTaken";
    case "LAST_ADMIN": return "lastAdmin";
    case "TOPIC_MISMATCH": return "topicMismatch";
    case "QUESTION_SUBJECT_MISMATCH": return "questionSubjectMismatch";
    case "QUESTIONS_REQUIRED": return "questionsRequired";
    case "NOTES_REQUIRED": return "notesRequired";
    case "FILE_REQUIRED": return "fileRequired";
    case "FILE_TYPE": return "fileType";
    case "WINDOW_INVALID": return "windowInvalid";
    case "FILE_NOT_READY": return "fileNotReady";
    case "NOT_ENROLLED": return "notEnrolled";
    case "CERT_EXISTS": return "certExists";
    case "NOT_FOUND": return "notFound";
    case "DUPLICATE": return "duplicate";
    case "PAYMENT_REQUIRED": return "paymentRequired";
    case "ACCESS_REVOKED": return "accessRevoked";
    default: return "generic";
  }
}
