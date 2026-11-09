# 0020. A small service worker keeps the app's own files, and nothing else

Date: 2026-11-09. Status: proposed (the user may veto). Records D-059.

**Why.** The Atlas is local-first, so it should open with no connection once it has been visited. Profile data is already in IndexedDB; only the app's own files needed keeping.

**What it keeps.** Exactly the files the build produced (`dist/sw.js` lists them, `check-dist` compares the list with `dist/`). It never stores anything it fetches later, never touches IndexedDB or any storage, and ignores other origins, non-GET requests and any path not on the list. Profile data is never in the cache (tested in the browser).

**Pages: network first.** An online visit always gets the newest app. Offline, or if the network does not answer in 4 seconds, the kept copy opens. Built files come from the kept copy first. A bad answer (not OK) is never shown in place of the kept page.

**Updates wait for the person.** A new worker installs but does not take over by itself (no `skipWaiting`). The page shows "A newer version of the Atlas is ready. Your chart is saved. Reload when you are at a good stopping point." and a Reload now button; only that button asks the worker to take over, and the page reloads once it has. Old shell caches are deleted when the new one activates. A page is never swapped while someone is editing. The first install shows no notice, because nothing is being replaced.

**Old shell, newer data.** Unchanged and still safe: a record from a newer schema is refused (I-14), saves refuse to overwrite a newer record, and migrations run on a copy. The notice is there so an old tab is not left open for long, not because it is the only protection.

**Headers.** The worker's own fetches follow the CSP sent with `sw.js`, and the page's `connect-src 'none'` would stop it caching. So `sw.js` has its own rule with `connect-src 'self'` and `Cache-Control: no-cache`, and the page rule excludes `sw.js`. `config/security.js` generates both, and a test checks `vercel.json` matches. The page keeps `connect-src 'none'`.

**Source check.** `check-source` bans `fetch`. The worker file alone may use it, to pass the page's own same-origin requests on. Every other rule still applies to it, and the build check looks for other origins and storage use in `dist/sw.js`.

**Off in development.** Registration is production only. It fails quietly (private windows, old browsers, plain http) and the app works without it.

**Not done.** No background sync, push, or caching of share previews. Added to the privacy copy review (M6-05): the line that data "stays in this browser" should also say the app's own files are kept for offline use.
