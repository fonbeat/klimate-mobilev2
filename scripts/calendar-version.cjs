const fs = require('node:fs');
const path = require('node:path');

function calendarVersion(version) {
  const match = /^(\d{4})\.([1-9]|1[0-2])\.([1-9]\d?)$/.exec(version || '');
  if (!match || Number(match[1]) < 1000) throw new Error('Version must be YYYY.M.counter, with month 1–12 and counter 1–99.');
  const [, year, month, counter] = match;
  const versionCode = Number(`${year}${month.padStart(2, '0')}${counter.padStart(2, '0')}`);
  if (versionCode > 2100000000) throw new Error('Calendar build number exceeds the Android version-code limit.');
  return { version, buildNumber: version, versionCode };
}

function nextBuildVersion(current, date = new Date()) {
  calendarVersion(current);
  const [year, month, counter] = current.split('.').map(Number);
  const nextYear = date.getUTCFullYear();
  const nextMonth = date.getUTCMonth() + 1;
  if (!Number.isFinite(nextYear) || nextYear * 12 + nextMonth < year * 12 + month) throw new Error('Cannot move the build version to an earlier month.');
  const next = `${nextYear}.${nextMonth}.${nextYear === year && nextMonth === month ? counter + 1 : 1}`;
  return calendarVersion(next);
}

if (require.main === module) {
  const root = path.join(__dirname, '..');
  const appPath = path.join(root, 'app.json');
  const packagePath = path.join(root, 'package.json');
  const app = JSON.parse(fs.readFileSync(appPath, 'utf8'));
  const pkg = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
  const next = nextBuildVersion(app.expo.version);
  app.expo.version = pkg.version = next.version;
  app.expo.ios.buildNumber = next.buildNumber;
  app.expo.android.versionCode = next.versionCode;
  fs.writeFileSync(appPath, `${JSON.stringify(app, null, 2)}\n`);
  fs.writeFileSync(packagePath, `${JSON.stringify(pkg, null, 2)}\n`);
  console.log(`Version/iOS build: ${next.version}; Android build: ${next.versionCode}`);
}

module.exports = { calendarVersion, nextBuildVersion };
