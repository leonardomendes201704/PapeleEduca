/**
 * Local release APK pipeline:
 * 1) bump versionCode / versionName
 * 2) cap sync
 * 3) gradle assembleRelease
 * 4) copy APK to ../../dist/apk/
 */
import { spawnSync } from 'node:child_process';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MOBILE_ROOT = resolve(__dirname, '..');
const REPO_ROOT = resolve(MOBILE_ROOT, '..');
const GRADLE_FILE = join(MOBILE_ROOT, 'android', 'app', 'build.gradle');
const OUT_DIR = join(REPO_ROOT, 'dist', 'apk');
const isWin = process.platform === 'win32';

function javaMajor(javaHome) {
  if (!javaHome) return 0;
  const javaBin = join(javaHome, 'bin', isWin ? 'java.exe' : 'java');
  if (!existsSync(javaBin)) return 0;
  const out = spawnSync(javaBin, ['-version'], { encoding: 'utf8' });
  const text = `${out.stderr || ''}${out.stdout || ''}`;
  const match = text.match(/version "(\d+)/);
  return match ? Number(match[1]) : 0;
}

function resolveJavaHome() {
  const candidates = [
    'C:\\Program Files\\Android\\Android Studio\\jbr',
    join(process.env.LOCALAPPDATA || '', 'Programs', 'Android', 'Android Studio', 'jbr'),
    'C:\\Program Files\\Eclipse Adoptium\\jdk-21',
    'C:\\Program Files\\Microsoft\\jdk-21',
    process.env.JAVA_HOME || '',
  ];
  for (const dir of candidates) {
    if (javaMajor(dir) >= 21) return dir;
  }
  // Last resort: whatever is configured (may fail on JDK 17).
  return process.env.JAVA_HOME || candidates.find((d) => d && existsSync(join(d, 'bin', isWin ? 'java.exe' : 'java'))) || '';
}

function run(command, args, cwd = MOBILE_ROOT) {
  const line = `${command} ${args.join(' ')}`;
  console.log(`\n> ${line}`);
  const javaHome = resolveJavaHome();
  const env = {
    ...process.env,
    JAVA_HOME: javaHome || process.env.JAVA_HOME,
    PATH: javaHome
      ? `${join(javaHome, 'bin')}${isWin ? ';' : ':'}${process.env.PATH || ''}`
      : process.env.PATH,
    ANDROID_HOME: process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT
      || join(process.env.LOCALAPPDATA || '', 'Android', 'Sdk'),
  };
  const result = isWin
    ? spawnSync(line, { cwd, stdio: 'inherit', shell: true, env })
    : spawnSync(command, args, { cwd, stdio: 'inherit', env });
  if (result.status !== 0) {
    throw new Error(`Command failed: ${line}`);
  }
}

function readVersion() {
  if (!existsSync(GRADLE_FILE)) {
    throw new Error('android/app/build.gradle não encontrado. Rode cap add android antes.');
  }
  const text = readFileSync(GRADLE_FILE, 'utf8');
  const codeMatch = text.match(/versionCode\s+(\d+)/);
  const nameMatch = text.match(/versionName\s+"([^"]+)"/);
  if (!codeMatch) throw new Error('versionCode não encontrado em build.gradle');
  return {
    versionCode: Number(codeMatch[1]),
    versionName: nameMatch ? nameMatch[1] : `1.0.${codeMatch[1]}`,
    text,
  };
}

function bumpVersion() {
  const current = readVersion();
  const nextCode = current.versionCode + 1;
  const nextName = `1.0.${nextCode}`;
  let text = current.text;
  text = text.replace(/versionCode\s+\d+/, `versionCode ${nextCode}`);
  if (/versionName\s+"[^"]+"/.test(text)) {
    text = text.replace(/versionName\s+"[^"]+"/, `versionName "${nextName}"`);
  } else {
    text = text.replace(
      /versionCode\s+\d+/,
      `versionCode ${nextCode}\n        versionName "${nextName}"`
    );
  }
  writeFileSync(GRADLE_FILE, text, 'utf8');
  console.log(`Version bumped → versionCode ${nextCode}, versionName ${nextName}`);
  return { versionCode: nextCode, versionName: nextName };
}

function findReleaseApk() {
  const candidates = [
    join(MOBILE_ROOT, 'android', 'app', 'build', 'outputs', 'apk', 'release', 'app-release.apk'),
    join(MOBILE_ROOT, 'android', 'app', 'build', 'outputs', 'apk', 'release', 'app-release-unsigned.apk'),
  ];
  for (const file of candidates) {
    if (existsSync(file)) return file;
  }
  throw new Error('APK de release não encontrado após o Gradle.');
}

function main() {
  const skipBump = process.argv.includes('--no-bump');
  const version = skipBump ? readVersion() : bumpVersion();

  run('npm', ['run', 'bundle:plugins']);
  run('npx', ['cap', 'sync', 'android']);

  const gradlew = isWin ? 'gradlew.bat' : './gradlew';
  run(gradlew, ['assembleRelease'], join(MOBILE_ROOT, 'android'));

  const apk = findReleaseApk();
  mkdirSync(OUT_DIR, { recursive: true });
  const versioned = join(
    OUT_DIR,
    `papele-educa-moderation-v${version.versionName || 'current'}.apk`
  );
  const latest = join(OUT_DIR, 'papele-educa-moderation-latest.apk');
  copyFileSync(apk, versioned);
  copyFileSync(apk, latest);

  console.log('\nAPK pronto:');
  console.log(`  ${versioned}`);
  console.log(`  ${latest}`);
}

main();
