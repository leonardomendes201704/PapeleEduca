/**
 * Smoke checks for blog moderation flow (no device required).
 * Run: node scripts/smoke-moderation.mjs
 */
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
let failed = 0;

function ok(label) {
  console.log(`OK  ${label}`);
}
function fail(label, detail) {
  failed += 1;
  console.error(`FAIL ${label}${detail ? ` — ${detail}` : ''}`);
}

// 1) Automation forces draft
const helper = readFileSync(join(root, 'scripts/blog-automation-helpers.mjs'), 'utf8');
if (helper.includes("status: 'draft'") && helper.includes('published_at: null')) {
  ok('automation helper forces draft');
} else {
  fail('automation helper forces draft');
}
if (/status:\s*'published'/.test(helper) && !helper.includes('// Always draft')) {
  fail('automation still hardcodes published somewhere unexpected');
} else {
  ok('automation does not publish live by default');
}

// 2) Notify API exists
const notify = join(root, 'api/blog/notify-draft.js');
if (existsSync(notify) && readFileSync(notify, 'utf8').includes('admin_push_devices')) {
  ok('notify-draft API present');
} else {
  fail('notify-draft API present');
}

// 3) SQL push table
const sql = join(root, 'supabase-blog-push.sql');
if (existsSync(sql) && readFileSync(sql, 'utf8').includes('admin_push_devices')) {
  ok('supabase-blog-push.sql present');
} else {
  fail('supabase-blog-push.sql present');
}

// 4) Mobile UI screens/actions
const appJs = readFileSync(join(root, 'mobile/www/app.js'), 'utf8');
for (const needle of ['approvePost', 'rejectPost', 'postToFacebook', 'buildPreviewDocument', 'registerPushToken']) {
  if (appJs.includes(needle)) ok(`mobile app has ${needle}`);
  else fail(`mobile app has ${needle}`);
}
if (appJs.includes('srcdoc') || appJs.includes('buildPreviewDocument')) {
  ok('preview uses in-app HTML (no public metrics URL)');
} else {
  fail('preview uses in-app HTML (no public metrics URL)');
}

// 5) APK artifacts
const apkDir = join(root, 'dist/apk');
const apks = existsSync(apkDir)
  ? readdirSync(apkDir).filter((f) => f.endsWith('.apk'))
  : [];
if (apks.includes('papele-educa-moderation-latest.apk')) {
  ok('latest APK in dist/apk');
} else {
  fail('latest APK in dist/apk');
}
const versioned = apks.find((f) => /^papele-educa-moderation-v1\.0\.\d+\.apk$/.test(f));
if (versioned) ok(`versioned APK present (${versioned})`);
else fail('versioned APK present', apks.join(', ') || 'none');

// 6) Signing + applicationId
const gradle = readFileSync(join(root, 'mobile/android/app/build.gradle'), 'utf8');
if (gradle.includes('br.com.papeleeduca.moderation')) ok('applicationId stable');
else fail('applicationId stable');
if (gradle.includes('signingConfigs') && gradle.includes('signingConfig signingConfigs.release')) {
  ok('release signing configured');
} else {
  fail('release signing configured');
}
if (existsSync(join(root, 'mobile/android/keystore/moderation.jks'))) {
  ok('release keystore present');
} else {
  fail('release keystore present');
}

if (failed) {
  console.error(`\n${failed} check(s) failed`);
  process.exitCode = 1;
} else {
  console.log('\nAll smoke checks passed.');
}
