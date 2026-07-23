import assert from "node:assert/strict";
import test from "node:test";
import { randomBytes } from "node:crypto";
import { assertStrongPassword } from "@/lib/security";
import { decryptSecret, encryptSecret } from "@/lib/config-crypto";
import { assertSafeUpload } from "@/lib/file-security";
import { formatAiMarkdown } from "@/components/ai/AiMessageContent";

test("password policy rejects defaults and accepts a strong password", () => {
  assert.throws(() => assertStrongPassword("Admin123!"));
  assert.throws(() => assertStrongPassword("onlyletters"));
  assert.doesNotThrow(() => assertStrongPassword("KaiyiSecure2026!"));
});

test("AES-GCM encrypted configuration rejects tampering", () => {
  const previous = process.env.CONFIG_ENCRYPTION_KEY;
  process.env.CONFIG_ENCRYPTION_KEY = randomBytes(32).toString("base64");
  try {
    const encrypted = encryptSecret("sensitive-value");
    assert.notEqual(encrypted, "sensitive-value");
    assert.equal(decryptSecret(encrypted), "sensitive-value");
    const tampered = `${encrypted.slice(0, -1)}${encrypted.endsWith("A") ? "B" : "A"}`;
    assert.throws(() => decryptSecret(tampered));
  } finally {
    if (previous === undefined) delete process.env.CONFIG_ENCRYPTION_KEY;
    else process.env.CONFIG_ENCRYPTION_KEY = previous;
  }
});

test("upload validation rejects active content and disguised executables", () => {
  assert.throws(() => assertSafeUpload({ name: "payload.svg", type: "image/svg+xml" }, Buffer.from("<svg/>")));
  assert.throws(() => assertSafeUpload({ name: "photo.jpg", type: "image/jpeg" }, Buffer.from([0x4d, 0x5a, 0, 0])));
  assert.doesNotThrow(() => assertSafeUpload({ name: "call.mp3", type: "audio/mpeg" }, Buffer.from("ID3audio"), { allowedExts: ["mp3"] }));
});

test("AI markdown escapes HTML, event handlers, and javascript links", () => {
  const rendered = formatAiMarkdown('<img src=x onerror=alert(1)> [x](javascript:alert(1))');
  assert.ok(rendered.includes("&lt;img"));
  assert.ok(!rendered.includes("<img"));
  assert.ok(!rendered.includes('href="javascript:'));
});
