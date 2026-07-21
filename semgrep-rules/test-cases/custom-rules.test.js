// Test cases for semgrep-rules/custom-rules.yml
// Run: semgrep scan --config semgrep-rules/custom-rules.yml semgrep-rules/test-cases/
//
// These mirror real patterns found in Juice Shop's own source:
//   - lib/insecurity.ts:42  crypto.createHmac('sha256', 'pa4qacea4VK9t9nGv7yZtwmj')
//   - lib/insecurity.ts:54  jwt.sign(user, privateKey, {...}) where privateKey is a hardcoded const
//   - routes/captcha.ts:22  eval(expression)
//   - routes/userProfile.ts:61  eval(code)
//
// Lines are annotated with `// ruleid: <id>` (should match) or
// `// ok: <id>` (should NOT match) per Semgrep's testing convention.

const crypto = require("crypto");
const jwt = require("jsonwebtoken");

function hmacBad(data) {
  // ruleid: hardcoded-crypto-secret
  return crypto.createHmac("sha256", "pa4qacea4VK9t9nGv7yZtwmj").update(data).digest("hex");
}

function hmacGood(data) {
  // ok: hardcoded-crypto-secret
  return crypto.createHmac("sha256", process.env.HMAC_SECRET).update(data).digest("hex");
}

function signBad(payload) {
  // ruleid: hardcoded-crypto-secret
  return jwt.sign(payload, "supersecret123");
}

function signGood(payload) {
  // ok: hardcoded-crypto-secret
  return jwt.sign(payload, process.env.JWT_SECRET);
}

function runBad(userInput) {
  // ruleid: dangerous-eval-usage
  return eval(userInput);
}

function runGood(userInput) {
  // ok: dangerous-eval-usage
  return JSON.parse(userInput);
}