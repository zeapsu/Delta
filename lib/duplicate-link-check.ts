import assert from "node:assert";
import { duplicateOf, sameAccount, type LinkedBank } from "./duplicate-link";

const checking = { name: "Everyday Checking", type: "depository", subtype: "checking", mask: "1111" };
const card = { name: "Rewards Card", type: "credit", subtype: "credit card", mask: "2222" };
const savings = { name: "Savings", type: "depository", subtype: "savings", mask: "4444" };
const bank: LinkedBank & { id: number } = { id: 1, institution: "First Example Bank", accounts: [checking, card] };

// The same login again: same accounts under new ids.
assert.strictEqual(duplicateOf({ institution: "First Example Bank", accounts: [checking, card] }, [bank])?.id, 1);
// One shared account is enough (the new link also picked the savings account).
assert.strictEqual(duplicateOf({ institution: "first example bank ", accounts: [savings, checking] }, [bank])?.id, 1);
// A renamed account is still the same account.
assert.strictEqual(duplicateOf({ institution: "First Example Bank", accounts: [{ ...checking, name: "Bills" }] }, [bank])?.id, 1);

// Other accounts at the same bank: a second login, not a duplicate.
assert.strictEqual(duplicateOf({ institution: "First Example Bank", accounts: [savings] }, [bank]), undefined);
// The same last digits at another bank.
assert.strictEqual(duplicateOf({ institution: "Second Example Bank", accounts: [checking] }, [bank]), undefined);
// Same digits, different kind of account.
assert.strictEqual(duplicateOf({ institution: "First Example Bank", accounts: [{ ...savings, mask: "1111" }] }, [bank]), undefined);
// Nothing linked, or nothing known about the new link.
assert.strictEqual(duplicateOf({ institution: "First Example Bank", accounts: [checking] }, []), undefined);
assert.strictEqual(duplicateOf({ institution: "First Example Bank", accounts: [] }, [bank]), undefined);

// A connection saved without a name can still be recognised by its accounts.
assert.strictEqual(duplicateOf({ institution: "First Example Bank", accounts: [card] }, [{ ...bank, institution: null }])?.id, 1);
assert.strictEqual(duplicateOf({ institution: null, accounts: [card] }, [bank])?.id, 1);

// A connection Plaid no longer has can't be reconnected, so it doesn't block
// linking the bank again. One that only needs a new login still does.
const again = { institution: "First Example Bank", accounts: [checking, card] };
assert.strictEqual(duplicateOf(again, [{ ...bank, lastErrorCode: "ITEM_NOT_FOUND" }]), undefined);
assert.strictEqual(duplicateOf(again, [{ ...bank, lastErrorCode: "ITEM_LOGIN_REQUIRED" }])?.id, 1);
assert.strictEqual(duplicateOf(again, [{ ...bank, lastErrorCode: null }])?.id, 1);

// No mask on either side: the name stands in. A mask on one side only is no match.
const loan = { name: "Auto Loan", type: "loan", subtype: "auto", mask: null };
assert.ok(sameAccount(loan, { ...loan, name: " auto loan" }));
assert.ok(!sameAccount(loan, { ...loan, name: "Student Loan" }));
assert.ok(!sameAccount(loan, { ...loan, mask: "9999" }));
assert.ok(!sameAccount(checking, { ...checking, mask: "1112" }));

console.log("duplicate-link-check: ok");
