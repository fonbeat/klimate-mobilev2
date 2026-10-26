const fs = require('node:fs');
const path = require('node:path');
const { calendarVersion } = require('./calendar-version.cjs');

const blockedPermissions = [
  'android.permission.READ_EXTERNAL_STORAGE',
  'android.permission.WRITE_EXTERNAL_STORAGE',
  'android.permission.READ_MEDIA_IMAGES',
  'android.permission.READ_MEDIA_VIDEO',
  'android.permission.RECORD_AUDIO',
];

function secureUrl(value) {
  try { const url = new URL(value); return url.protocol === 'https:' && !!url.hostname && !url.username && !url.password; }
  catch { return false; }
}

function buildMobileConfig(base, env = process.env) {
  const calendar = calendarVersion(base.version);
  const release = env.EAS_BUILD_PROFILE === 'production' || env.EAS_BUILD_PROFILE === 'preview' || env.KLIMATE_STORE_BUILD === '1';
  const apiUrl = env.EXPO_PUBLIC_API_URL || 'https://web-api.klimate.app';
  const projectId = env.EAS_PROJECT_ID || base.extra?.eas?.projectId;
  const icon = env.KLIMATE_APP_ICON || base.icon;
  const foregroundImage = env.KLIMATE_ADAPTIVE_ICON || base.android?.adaptiveIcon?.foregroundImage;
  const googleServicesFile = env.GOOGLE_SERVICES_JSON || base.android?.googleServicesFile;
  const config = {
    ...base,
    ...(icon ? { icon } : {}),
    extra: { ...base.extra, ...(projectId ? { eas: { ...base.extra?.eas, projectId } } : {}) },
    ios: {
      ...base.ios,
      buildNumber: calendar.buildNumber,
      infoPlist: {
        ...base.ios?.infoPlist,
        NSAppTransportSecurity: release
          ? { NSAllowsArbitraryLoads: false, NSAllowsLocalNetworking: false }
          : { NSAllowsArbitraryLoads: true, NSAllowsLocalNetworking: true },
      },
    },
    android: {
      ...base.android,
      versionCode: calendar.versionCode,
      ...(googleServicesFile ? { googleServicesFile } : {}),
      adaptiveIcon: { ...base.android?.adaptiveIcon, ...(foregroundImage ? { foregroundImage } : {}) },
      blockedPermissions: [...new Set([
        ...base.android?.blockedPermissions || [], ...blockedPermissions,
        ...(release ? ['android.permission.SYSTEM_ALERT_WINDOW'] : []),
      ])],
    },
    plugins: [
      ...base.plugins || [],
      ['expo-build-properties', { android: { compileSdkVersion: 37, targetSdkVersion: 36, usesCleartextTraffic: !release } }],
      ['./plugins/with-release-security.cjs', { release }],
    ],
  };
  if (release && !secureUrl(apiUrl)) throw new Error('Release API URL must use HTTPS without embedded credentials.');
  return config;
}

function releaseIssues(config, env = process.env, root = path.join(__dirname, '..'), { deferFirebase = false } = {}) {
  const issues = [];
  const android = env.EAS_BUILD_PLATFORM !== 'ios';
  const projectId = config.extra?.eas?.projectId;
  if (!/^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(projectId || '')) issues.push('Set EAS_PROJECT_ID to the linked Expo/EAS project UUID.');
  const checkImage = (asset, label, opaque) => {
    if (!asset || !fs.existsSync(path.resolve(root, asset))) { issues.push(`Provide ${label}.`); return; }
    const data = fs.readFileSync(path.resolve(root, asset));
    if (data.length < 33 || data.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') { issues.push(`${label} must be a PNG.`); return; }
    if (data.readUInt32BE(16) !== 1024 || data.readUInt32BE(20) !== 1024) issues.push(`${label} must be 1024 × 1024 pixels.`);
    if (opaque && ([4, 6].includes(data[25]) || data.includes(Buffer.from('tRNS')))) issues.push(`${label} must have no alpha/transparency channel for iOS.`);
  };
  checkImage(config.icon, 'KLIMATE_APP_ICON (approved opaque launcher icon)', true);
  if (android) {
    checkImage(config.android?.adaptiveIcon?.foregroundImage, 'KLIMATE_ADAPTIVE_ICON (padded adaptive foreground)', false);
    const file = config.android?.googleServicesFile;
    // EAS secret file variables are unavailable during local config resolution.
    // The store check/build hook validates them on the builder instead.
    if (deferFirebase) return issues;
    if (!file || !fs.existsSync(path.resolve(root, file))) issues.push('Set GOOGLE_SERVICES_JSON to the Firebase Android configuration file.');
    else {
      try {
        const json = JSON.parse(fs.readFileSync(path.resolve(root, file), 'utf8'));
        if (!json.project_info?.project_id || !json.client?.some((client) => client.client_info?.android_client_info?.package_name === config.android?.package)) issues.push('Firebase configuration must include Android package app.klimate.mobile.');
      } catch { issues.push('Firebase Android configuration is not valid JSON.'); }
    }
  }
  return issues;
}

module.exports = { buildMobileConfig, releaseIssues, secureUrl };
