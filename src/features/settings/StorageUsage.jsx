// How much space the open profile and this browser's storage for the site are using (M2-08).
// Both numbers are estimates and the text says so. Nothing is sent anywhere: the browser's
// own estimate() call reports it, and it is not shown when the browser does not offer one.
import { useEffect, useState } from 'react';
import { estimateStorage } from '../../storage/database.js';
import { formatBytes, profileBytes } from './format-bytes.js';

/**
 * @param {{ profile: object|null, estimate?: () => Promise<{ usage: number, quota: number }|null> }} props
 */
export function StorageUsage({ profile, estimate = estimateStorage }) {
  const [browser, setBrowser] = useState(undefined); // undefined: asking, null: not available
  const revision = profile?.revision;

  useEffect(() => {
    let cancelled = false;
    estimate().then((result) => { if (!cancelled) setBrowser(result); }).catch(() => { if (!cancelled) setBrowser(null); });
    return () => { cancelled = true; };
  }, [estimate, revision]);

  let browserText = 'Checking how much space this browser is using…';
  if (browser === null) browserText = 'This browser does not say how much space is used.';
  else if (browser) {
    const share = browser.quota > 0 ? ` of about ${formatBytes(browser.quota)} it allows` : '';
    browserText = `This site is using about ${formatBytes(browser.usage)}${share} in this browser.`;
  }

  return (
    <div className="panel-block storage-usage">
      <h3>Storage</h3>
      {profile && <p>This profile takes about {formatBytes(profileBytes(profile))}.</p>}
      <p>{browserText}</p>
      <p className="hint">These are estimates. Download a backup to keep a copy outside this browser.</p>
    </div>
  );
}
