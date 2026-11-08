# M6-03 Cross-browser and mobile checks

Only Chromium (desktop and Pixel 5 emulation) is available where this was built. Firefox and Safari need to be run by the owner.

## Browser features the app uses
| Feature | Where | Where it can be missing | Fallback |
|---|---|---|---|
| `CompressionStream` / `DecompressionStream` (`deflate-raw`) | share links | older browsers (Safari before 16.4, Firefox before 113) | link not offered, file offered (tested) |
| `navigator.clipboard` | copy link | plain http, some privacy settings | select-and-copy text box (tested) |
| `crypto.randomUUID` | new ids | any non-secure origin, e.g. http on a home network | `getRandomValues` (fixed, unit and e2e tested) |
| `structuredClone` | migrations | Safari before 15.4 | a failed copy makes the migration refuse safely and leave the stored record unchanged |
| canvas `toBlob` | PNG export | rare | message "This browser cannot make a picture here." |
| `color-mix()` | two styles | Safari before 16.2, Firefox before 113 | only the faint dot or stripe fill is lost; the border style that carries the pattern stays |

## Results (Chromium)
| Check | Result |
|---|---|
| Viewport meta allows zoom | Pass |
| All text fields at least 16 px (no iOS focus zoom) | Pass |
| Landscape phone, tablet and small laptop: no sideways scroll | Pass |
| 200% text on a phone | Fixed (item rows and add-forms overflowed) |
| No randomUUID, clipboard or compression streams: app still works, no page errors | Fixed (ids threw) |
| Print media makes no outside requests | Pass |

## Run the other engines yourself
```
npx playwright install firefox webkit
ATLAS_ALL_BROWSERS=1 npx playwright test --project=firefox --project=safari --project=iphone
```
Then, by hand, on a real iPhone and Android phone: make a chart, make a view, open a share link, download a PNG, add to home screen, turn on VoiceOver or TalkBack and walk through one chart.

## Known gaps
No real device, screen reader, or non-Chromium engine has been run by this review.
