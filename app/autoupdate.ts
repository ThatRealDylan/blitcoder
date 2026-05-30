import fs from 'fs-extra';
import path from 'path';

export interface UpdateInfo {
  currentVersion: string;
  latestVersion: string;
  hasUpdate: boolean;
  downloadUrl?: string;
}

export async function checkForUpdates(): Promise<UpdateInfo | null> {
  try {
    const packageJsonPath = path.join(process.cwd(), 'package.json');
    if (!fs.existsSync(packageJsonPath)) return null;

    const packageJson = fs.readJsonSync(packageJsonPath);
    const currentVersion = packageJson.version || '1.0.0';

    const response = await fetch('https://api.github.com/repos/ThatRealDylan/blitcoder/releases/latest', {
      headers: {
        'User-Agent': 'BlitCoder-Update-Checker'
      }
    });

    if (!response.ok) return null;

    const data: any = await response.json();
    const latestVersion = data.tag_name ? data.tag_name.replace(/^v/, '') : null;

    if (!latestVersion) return null;

    // Basic semver compare
    const currentParts = currentVersion.split('.').map(Number);
    const latestParts = latestVersion.split('.').map(Number);

    let hasUpdate = false;
    for (let i = 0; i < Math.max(currentParts.length, latestParts.length); i++) {
      const c = currentParts[i] || 0;
      const l = latestParts[i] || 0;
      if (l > c) {
        hasUpdate = true;
        break;
      }
      if (c > l) {
        break;
      }
    }

    return {
      currentVersion,
      latestVersion,
      hasUpdate,
      downloadUrl: data.zipball_url || data.html_url
    };
  } catch (e) {
    // Fail silently on network errors
    return null;
  }
}
