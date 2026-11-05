import assert from "node:assert";
import { greeting, parseProfileInput, parseStoredProfile, validTimeZone } from "./profile";

assert.ok(validTimeZone("America/Los_Angeles"));
assert.ok(validTimeZone("UTC"));
assert.ok(!validTimeZone("Mars/Olympus"));
assert.ok(!validTimeZone(""));
assert.ok(!validTimeZone(42));

assert.deepStrictEqual(parseProfileInput({ name: "  Jo ", timeZone: "Europe/Paris" }), { ok: true, value: { name: "Jo", timeZone: "Europe/Paris" } });
assert.deepStrictEqual(parseProfileInput({ name: "" }), { ok: true, value: { name: null } });
assert.deepStrictEqual(parseProfileInput({}), { ok: true, value: {} });
assert.strictEqual(parseProfileInput({ name: "x".repeat(41) }).ok, false);
assert.strictEqual(parseProfileInput({ timeZone: "Nope/Nope" }).ok, false);
assert.strictEqual(parseProfileInput(null).ok, false);

assert.deepStrictEqual(parseStoredProfile('{"name":"Jo","timeZone":"bad"}'), { name: "Jo", timeZone: null });
assert.strictEqual(parseStoredProfile("not json"), null);
assert.strictEqual(parseStoredProfile(undefined), null);

assert.strictEqual(greeting(23, "Jo"), "Good evening, Jo");
assert.strictEqual(greeting(2, null), "Good evening");
assert.strictEqual(greeting(9, null), "Good morning");
assert.strictEqual(greeting(14, "Jo"), "Good afternoon, Jo");

console.log("profile-check: ok");
