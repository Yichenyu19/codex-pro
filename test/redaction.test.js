import test from "node:test";
import assert from "node:assert/strict";

import {
  buildShareableDiagnostics,
  redactLocalPaths,
  redactObject,
  redactPath,
  redactSecrets,
  redactText
} from "../src/redaction.js";

test("redactPath and redactLocalPaths fold local paths while keeping basename", () => {
  assert.equal(redactPath("C:\\Users\\Alice\\SecretProject\\src\\bridge.js"), "[local-path]\\bridge.js");
  assert.equal(redactPath("/Users/alice/SecretProject/src/service.js"), "[local-path]/service.js");

  const text = [
    "open C:\\Users\\Alice\\SecretProject\\src\\bridge.js",
    "backup D:\\Work\\PrivateRepo",
    "check /home/alice/private/config.toml"
  ].join("\n");
  const redacted = redactLocalPaths(text);

  assert.match(redacted, /\[local-path\]\\bridge\.js/);
  assert.match(redacted, /\[local-path\]\\PrivateRepo/);
  assert.match(redacted, /\[local-path\]\/config\.toml/);
  assert.doesNotMatch(redacted, /Alice|SecretProject|\/home\/alice|D:\\Work/);
});

test("redactSecrets masks common keys, bearer tokens, auth.json, encrypted_content and base_url", () => {
  const text = [
    "Authorization: Bearer abcdefghijklmnopqrstuvwxyz",
    "OPENAI_API_KEY=sk-proj-abcdefghijklmnopqrstuvwxyz",
    "session_token: session-secret-value",
    "auth.json content {\"token\":\"secret-token-value\",\"account\":\"user@example.com\"}",
    "{\"encrypted_content\":\"secret-encrypted-payload\"}",
    "base_url = \"https://proxy.example.test/v1?token=private-token&model=x\"",
    "https://example.test/callback?signature=secret-signature-value&id=1"
  ].join("\n");
  const redacted = redactSecrets(text);

  assert.match(redacted, /Authorization: \[secret\]/);
  assert.match(redacted, /OPENAI_API_KEY=\[secret\]/);
  assert.match(redacted, /session_token: \[secret\]/);
  assert.match(redacted, /auth\.json content \[auth-json-redacted\]/);
  assert.match(redacted, /"encrypted_content":"\[secret\]"/);
  assert.match(redacted, /base_url = "\[base-url\]"/);
  assert.match(redacted, /https:\/\/example\.test\/callback\?\[redacted-query\]/);
  assert.doesNotMatch(redacted, /abcdefghijklmnopqrstuvwxyz|secret-token-value|secret-encrypted-payload|private-token|secret-signature-value/);
});

test("redactText combines path and secret redaction for user-copyable text", () => {
  const redacted = redactText(
    "C:\\Users\\Alice\\SecretProject\\.env OPENAI_API_KEY=sk-proj-abcdefghijklmnopqrstuvwxyz"
  );

  assert.match(redacted, /\[local-path\]\\.env/);
  assert.match(redacted, /OPENAI_API_KEY=\[secret\]/);
  assert.doesNotMatch(redacted, /Alice|SecretProject|sk-proj/);
});

test("redactObject recursively protects sensitive keys and string values", () => {
  const redacted = redactObject({
    product: "Codex Pro",
    path: "C:\\Users\\Alice\\SecretProject\\state_5.sqlite",
    nested: {
      access_token: "secret-token-value",
      encrypted_content: "secret-encrypted-payload",
      "auth.json": { token: "secret-token-value" },
      base_url: "https://proxy.example.test/v1?token=private-token"
    }
  });

  assert.equal(redacted.product, "Codex Pro");
  assert.equal(redacted.nested.access_token, "[secret]");
  assert.equal(redacted.nested.encrypted_content, "[encrypted-content]");
  assert.equal(redacted.nested["auth.json"], "[auth-json-redacted]");
  assert.equal(redacted.nested.base_url, "[base-url]");
  assert.match(redacted.path, /\[local-path\]\\state_5\.sqlite/);
  assert.doesNotMatch(JSON.stringify(redacted), /Alice|SecretProject|secret-token-value|secret-encrypted-payload|private-token/);
});

test("buildShareableDiagnostics emits a compact redacted diagnostics payload", () => {
  const diagnostics = buildShareableDiagnostics({
    product: "Codex Pro",
    productState: { kind: "compatibility", label: "兼容模式" },
    historyVisibility: { summary: "历史可见性需要修复" },
    recoveryPlan: {
      state: "recoverable",
      uiMode: "takeover_compatibility",
      summary: "可按固定三步恢复",
      recommendedAction: "修复历史显示"
    },
    management: {
      compatibilityMode: true,
      guardRunning: false,
      launcherLogPath: "C:\\Users\\Alice\\.codex-pro\\launcher.log",
      diagnosisPath: "C:\\Users\\Alice\\.codex-pro\\cdp-diagnosis.json",
      bridgeToken: "secret-token-value"
    }
  });

  assert.match(diagnostics, /"product": "Codex Pro"/);
  assert.match(diagnostics, /\[local-path\]\\\\launcher\.log/);
  assert.match(diagnostics, /\[local-path\]\\\\cdp-diagnosis\.json/);
  assert.doesNotMatch(diagnostics, /Alice|secret-token-value|bridgeToken/);
});
