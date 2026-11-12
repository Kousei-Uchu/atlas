# 0031. Locked backup (password-protected export) and its threat note

Date: 2026-11-12. Status: proposed (the owner may veto). Records D-071. Part of M8 (M8-04). Supersedes the "not encrypted until M8" part of D-020 for full backups only.

## Scope

Only the full backup can be locked. Views and exports are copies meant to be read by someone else, who would need the password sent separately, which is the same problem again; share links and QR codes stay unencrypted. A locked backup is for the person's own safekeeping: a copy in cloud storage, on a shared computer, or in an email to themselves.

## What it is

A file `atlas-backup-<name>-<date>-locked.json` holding a small readable header and the encrypted ordinary backup text:

```
{ format: "atlas-locked-backup", formatVersion: 1,
  kdf: { name: "PBKDF2-SHA256", rounds: 600000, salt: <16 random bytes> },
  cipher: { name: "AES-256-GCM", nonce: <12 random bytes> },
  data: <ciphertext + 16-byte tag> }
```

Made with the browser's own Web Crypto, on the device. Nothing is stored or sent: not the password, the key or the plaintext. A fresh salt and nonce are made every time. The format name, version and key settings are authenticated as additional data, so changing any of them makes decryption fail. After unlocking, the plaintext goes through the same gate as any backup (size, JSON, forbidden keys, depth, strict schema, full validation, migration on a copy) and imports as a new profile only after the preview (I-08, I-12, I-14).

## Why these choices

- **Web Crypto only.** No library to audit or ship, no code of ours implementing a cipher. The cost is that the key derivation is limited to what the browser offers: PBKDF2, not a memory-hard function. 600,000 rounds of SHA-256 is the current common recommendation for PBKDF2, takes a fraction of a second here, and slows guessing but does not stop a determined attacker with graphics hardware. The password is therefore the real protection, and the screen says so.
- **A reasonable password rule.** At least 12 characters (counted as characters), at most 256, typed twice. No strength meter and no composition rules: a meter would be a score about the person (I-10) and length matters most. The hint suggests a few words in a row. The password is normalised to NFKC so the same text typed on different devices gives the same key; case and spaces are exact.
- **One answer for a wrong password and a changed file.** AES-GCM cannot tell them apart and the message does not try to. No plaintext is returned on failure.

## Reading an untrusted file (R-05 and I-08)

The header is untrusted input. It is parsed under a size limit before anything runs, with reserved keys refused, and then checked against a strict schema: exactly this format and version, exactly this algorithm pair, rounds between 300,000 and 2,000,000 (so a file cannot make the browser work for minutes), exact salt and nonce sizes, base64 only, and a ciphertext size that cannot decrypt to more than the 4 MiB backup limit. A newer version is refused with the usual message. Out-of-range files are refused before any key is derived. Tests cover each refusal.

## What it protects against

- Someone who gets the file (cloud storage, a shared drive, an email, a lost USB stick, a family member browsing a folder) and does not know the password. They cannot read the contents, and cannot change them without it being detected.
- A mistake: the unlocked contents never go anywhere but the ordinary import preview.

## What it does not protect against, and the screen says the first three plainly

1. **A forgotten password.** There is no recovery. Nobody, including the app, can open the file. The announcement after saving repeats this.
2. **A weak or reused password.** The file can be guessed against offline for as long as it exists. Length is the defence.
3. **That a backup exists.** The file name, size and the plain header show it is an Atlas locked backup and roughly how large the profile is.
4. **A compromised device.** Malware, a keylogger, a malicious extension, or someone watching the screen can read the password, the open profile, or the unlocked file. The plaintext and key exist in browser memory while working and cannot be wiped from JavaScript; the password fields are cleared after use.
5. **The profile on this device.** IndexedDB is not encrypted by this feature. Locking applies to the backup file only.
6. **Future attacks.** A file kept for years can be attacked with future hardware. Re-lock with a longer password if that matters.
7. **A person being made to give up the password.** Out of scope.

## Copy

The text says "locked" and "encrypted" and states the limits above. It does not say "secure", "safe", "protected" or "private", and does not promise anything about strength; the copy-review test enforces that. The backup notice and the About text now mention the locked option. The wording is for the owner's sign-off with D-060 and D-063.

## Page requirements

Web Crypto needs a secure page (https or localhost). On a page without it, the panel says so and offers nothing to click; the unlocked backup still works. Unlocking on such a page says the same.

## Not done

No change to share links, exports, or the stored profile. No encrypted sync (M8-08, which needs its own threat model). No second factor, key file or recovery option, by choice: each adds a way to lose or leak the data.

## Tests

Unit: round trip equal to the original backup text and passing the ordinary gate; nothing readable in the file; new salt and nonce each time; one answer for a wrong password and a flipped byte; changed rounds or salt fail; Unicode forms; the default rounds; password length rules; refusals for each header field, sizes, encodings, reserved keys, oversize files; no plaintext on failure. E2E (desktop and phone): lock, nothing readable in the file, fields cleared, wrong password then right password, import as new; short or mismatched passwords write no file; a forged file with absurd rounds is refused; axe in three themes and 320 px.
