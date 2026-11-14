# 0035 Encrypted sync: threat model and recommendation (D-075, M8-08)

Status: threat model and recommendation only. **No sync code is written.** Building any of the options below needs the owner's decision (open item O-012).

## Why this is its own decision
Today the app's strongest promise is that nothing leaves the device (I-06). That promise is enforced by CSP `connect-src 'none'` on the page, an e2e audit that no request reaches another origin, and no runtime dependency that can send data. Any sync breaks that promise by design, so it must be justified, opt-in, and its failure modes understood first. The content is among the most sensitive a person can store: intimate preferences, boundaries and relationships.

## Assets
1. Profile contents (answers, notes, audiences, overrides, snapshots).
2. Who uses the app, and when (metadata: IP, timing, size, number of devices).
3. The encryption secret (password or key).
4. The promise itself (I-06) and the CSP that enforces it.

## Adversaries
| Adversary | Can do |
|---|---|
| Sync server operator, or someone who breaches it | Read, copy, delete, replace, replay stored blobs; see metadata |
| Network observer | See that sync happens, when, and roughly how much |
| Someone with a lost, stolen or shared device | Read local data; for sync, use any saved credential |
| A partner, family member or employer pressing for access | Coerce a password or a device unlock |
| A malicious or compromised update (app or dependency) | Read data before encryption; weaken the CSP |
| A malicious template, backup or sync blob | Inject unexpected content (covered by the existing untrusted-input gate, I-08) |
| Another sync client with a stale copy | Overwrite newer data (lost updates) |

## What encryption can and cannot do
- Client-side encryption (like the locked backup, D-071) hides contents from the server and network. It does not hide existence, size, timing or the number of devices.
- It does not protect against a compromised app build: the code that encrypts also sees plaintext. The service worker keeps builds fixed per version, but a hosted app can be replaced by whoever hosts it.
- It does not protect against coercion or a shared unlocked device.
- A forgotten password means unrecoverable data. Any recovery scheme (escrow, email reset) hands the server a way in, so none is allowed.
- Deletion is not guaranteed: a server can keep old blobs. "Delete everywhere" can only be a request.

## Threats, and what any design must do
| Threat | Required control |
|---|---|
| Server reads data | Encrypt on the device with a key the server never sees; AES-256-GCM with fresh nonces; authenticated headers (reuse D-071 construction) |
| Server swaps in an old or other person's blob (rollback, replay) | Version counter and a device-held last-seen value inside the authenticated payload; refuse older than last seen; warn on any unexplained drop |
| Server or network tampers | Authentication failure is one generic answer; nothing from a failed blob is applied |
| Two devices edit at once | Never merge silently: keep both as separate snapshots and let the person choose (mirrors I-12, import creates a NEW profile) |
| Sync breaks I-06 for everyone | Off by default; a separate build or an explicit per-profile opt-in; the sync endpoint is the only allowed origin, named in the CSP and shown in the UI; with sync off the CSP stays `connect-src 'none'` |
| Metadata leaks | Fixed-size padded blobs, one blob per profile, no profile titles or counts in the clear, no analytics, no accounts tied to real identity |
| Weak password | Same minimum as D-071 (12 characters) plus the same KDF; a server cannot rate-limit offline guessing of a stolen blob, so the password strength is the only defence |
| Compromised update | Exact dependency pins stay; sync code lives behind the opt-in and its own tests; release notes name any change to the CSP |
| Lost device | A way to remove a device's access (rotate the key) and a clear statement that this does not erase copies already made |
| Server shutdown or takeover | The user-held locked backup stays the primary, tested export path; sync is a convenience, never the only copy |
| Pressure to enable sync "for backup" | Never default, never nagging; plain statement of what leaves the device |

## Options
**A. No sync (current).** The locked backup (M8-04) is the portable form. People who want sync use their own file sync (Syncthing, iCloud Drive, a USB drive) for the encrypted `.json` file. Importing always creates a new profile, so nothing is overwritten. Zero new attack surface; I-06 intact. Cost: manual.

**B. Bring your own storage.** The app syncs the locked-backup format to a place the person controls (a WebDAV or similar endpoint, such as one they self-host). No operator exists to trust; the person owns the endpoint. Needs the CSP to allow one user-chosen origin (hard with a static CSP; needs a separate build or a settings page that is itself a risk). Moderate complexity, moderate attack surface.

**C. Hosted sync service.** A server operated for users. Introduces an operator, accounts, abuse handling, legal exposure, ongoing cost and a standing target for attackers. This is the largest change and conflicts with the project's local-first, no-backend direction.

## Recommendation
Keep option A as the supported path and document it better (a short "Keeping copies in sync yourself" guide, which carries no risk). Treat B as a possible later milestone only if the owner wants it, built as a separate opt-in build with the CSP change and the controls above, and tested with an adversarial server in e2e (replay, tamper, truncate, slow). Do not build C.

## Decisions needed from the owner (O-012)
1. Is any in-app sync wanted, or is A enough?
2. If B: one fixed endpoint kind (for example WebDAV) or several? A separate build, or a build-time flag?
3. Is a lost password acceptable to be unrecoverable (recommended: yes)?

## Not decided here
Any wire format, library or endpoint. Those come after the owner chooses.
