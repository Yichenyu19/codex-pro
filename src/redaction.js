const WINDOWS_ABSOLUTE_PATH = /[A-Za-z]:\\[^\s`"'<>]*/g;
const UNIX_HOME_PATH = /\/(?:Users|home)\/[^/\s`"'<>]+\/[^\s`"'<>]*/g;
const BEARER_TOKEN = /\bBearer\s+[A-Za-z0-9._~+/=-]{10,}/gi;
const API_STYLE_SECRET = /\b(?:sk|rk|pk)-[A-Za-z0-9][A-Za-z0-9_-]{10,}/g;
const KEY_VALUE_SECRET = /(\b(?:[A-Z0-9_]*API[_-]?KEY|(?:access|refresh|session|auth|bridge|codex[-_]?pro)[_-]?token|password|secret)\b\s*[:=]\s*["']?)([^"'\s,;}]{6,})/gi;
const STRUCTURED_SECRET_VALUE = /((?:"|')?(?:encrypted_content|authorization|cookie|access_token|refresh_token|session_token|auth_token|bridge_token|api_key|password|secret)(?:"|')?\s*[:=]\s*["']?)([^"'\s,;}]{6,})/gi;
const AUTH_JSON_OBJECT = /(\bauth\.json\b[^\r\n{]*)(\{[^\r\n]*\})/gi;
const BASE_URL_ASSIGNMENT = /(\bbase_url\b\s*[:=]\s*["']?)(https?:\/\/[^\s"'<>]+)/gi;
const URL_WITH_SENSITIVE_QUERY = /\b(https?:\/\/[^\s"'<>?]+)\?([^\s"'<>]+)/gi;
const SENSITIVE_QUERY_PARAM = /(?:^|[&;])(?:access_token|refresh_token|session_token|auth_token|token|key|api_key|secret|password|signature|sig)=/i;
const SENSITIVE_OBJECT_KEY = /(?:encrypted_content|authorization|cookie|access_token|refresh_token|session_token|auth_token|bridge_token|api[_-]?key|password|secret|auth\.json)/i;
const ENCRYPTED_CONTENT_KEY = /encrypted_content/i;
const AUTH_JSON_KEY = /auth\.json/i;
const BASE_URL_KEY = /base[_-]?url/i;

function basenameFromPath(value) {
  const cleaned = String(value ?? "").replace(/[)"'`>,;]+$/g, "");
  const parts = cleaned.split(/[\\/]+/).filter(Boolean);
  return parts.at(-1) || "local-path";
}

export function redactPath(value) {
  const raw = String(value ?? "");
  if (!raw) {
    return "";
  }
  const separator = raw.includes("/") && !raw.includes("\\") ? "/" : "\\";
  return separator === "/"
    ? `[local-path]/${basenameFromPath(raw)}`
    : `[local-path]\\${basenameFromPath(raw)}`;
}

export function redactLocalPaths(value) {
  return String(value ?? "")
    .replace(WINDOWS_ABSOLUTE_PATH, (match) => redactPath(match))
    .replace(UNIX_HOME_PATH, (match) => redactPath(match));
}

export function redactSecrets(value) {
  return String(value ?? "")
    .replace(AUTH_JSON_OBJECT, "$1[auth-json-redacted]")
    .replace(BASE_URL_ASSIGNMENT, "$1[base-url]")
    .replace(URL_WITH_SENSITIVE_QUERY, (match, baseUrl, query) => (
      SENSITIVE_QUERY_PARAM.test(query) ? `${baseUrl}?[redacted-query]` : match
    ))
    .replace(BEARER_TOKEN, "Bearer [secret]")
    .replace(API_STYLE_SECRET, "[secret]")
    .replace(STRUCTURED_SECRET_VALUE, "$1[secret]")
    .replace(KEY_VALUE_SECRET, "$1[secret]");
}

export function redactText(value) {
  return redactLocalPaths(redactSecrets(value));
}

export function redactObject(value) {
  if (Array.isArray(value)) {
    return value.map((item) => redactObject(item));
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, nested]) => {
      if (ENCRYPTED_CONTENT_KEY.test(key)) {
        return [key, "[encrypted-content]"];
      }
      if (AUTH_JSON_KEY.test(key)) {
        return [key, "[auth-json-redacted]"];
      }
      if (BASE_URL_KEY.test(key)) {
        return [key, "[base-url]"];
      }
      if (SENSITIVE_OBJECT_KEY.test(key)) {
        return [key, "[secret]"];
      }
      return [key, redactObject(nested)];
    }));
  }
  if (typeof value === "string") {
    return redactText(value);
  }
  return value;
}

export function buildShareableDiagnostics(status) {
  const safe = {
    product: status?.product ?? "Codex Pro",
    productState: status?.productState?.label ?? status?.productState?.kind ?? null,
    historyVisibility: status?.historyVisibility?.summary ?? null,
    recoveryPlan: status?.recoveryPlan
      ? {
          state: status.recoveryPlan.state ?? null,
          uiMode: status.recoveryPlan.uiMode ?? null,
          summary: status.recoveryPlan.summary ?? null,
          recommendedAction: status.recoveryPlan.recommendedAction ?? null
        }
      : null,
    management: status?.management
      ? {
          compatibilityMode: Boolean(status.management.compatibilityMode),
          guardRunning: Boolean(status.management.guardRunning),
          launcherLogPath: status.management.launcherLogPath
            ? redactPath(status.management.launcherLogPath)
            : null,
          diagnosisPath: status.management.diagnosisPath
            ? redactPath(status.management.diagnosisPath)
            : null
        }
      : null
  };

  return JSON.stringify(redactObject(safe), null, 2);
}

export function redactExportText(value) {
  return redactText(value);
}
