import fs from 'node:fs';
import path from 'node:path';
import PocketBase from 'pocketbase';

const appDir = process.cwd();
let port = process.env.PB_PORT || process.env.PORT;
if (!port && fs.existsSync(path.join(appDir, '.env'))) {
  const envContent = fs.readFileSync(path.join(appDir, '.env'), 'utf8');
  const match = envContent.match(/^\s*PB_PORT\s*=\s*(\d+)/m);
  if (match) port = match[1];
}
port = port || '38472';

const targetUsername = process.argv[2] || 'vasily';
const pbUrl = process.env.PB_URL || `http://127.0.0.1:${port}`;

console.log(`Connecting to PocketBase at ${pbUrl}...`);
console.log(`Target account: "${targetUsername}"`);

async function main() {
  const pb = new PocketBase(pbUrl);
  pb.autoCancellation(false);

  // We need to find the user record for targetUsername
  // PocketBase allows superuser or direct admin auth to query without user password
  // Let's check if we can query users
  const adminEmail = process.env.PB_ADMIN_EMAIL;
  const adminPass = process.env.PB_ADMIN_PASSWORD;

  if (adminEmail && adminPass) {
    console.log(`Authenticating as superuser ${adminEmail}...`);
    await pb.collection('_superusers').authWithPassword(adminEmail, adminPass);
  }

  // Find user by username
  let user;
  try {
    user = await pb.collection('users').getFirstListItem(`username = "${targetUsername}"`);
  } catch (err) {
    console.error(`Could not find user with username "${targetUsername}":`, err.message);
    console.error('Make sure the user exists, or run with superuser credentials:');
    console.error('PB_ADMIN_EMAIL=admin@example.com PB_ADMIN_PASSWORD=secret node scripts/seed-user-presets.mjs vasily');
    process.exit(1);
  }

  console.log(`Found user: ID=${user.id}, Username=${user.username}`);

  // Use typescript to transpile factory-presets.ts
  const ts = (await import('typescript')).default;
  const tsContent = fs.readFileSync(path.join(appDir, 'src/presets/factory-presets.ts'), 'utf8');
  const compiled = ts.transpileModule(tsContent, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  const modExports = {};
  new Function('exports', compiled)(modExports);
  const factoryPresets = modExports.FACTORY_PRESETS;
  console.log(`Loaded ${factoryPresets.length} factory presets.`);

  let createdCount = 0;
  let skippedCount = 0;

  for (const preset of factoryPresets) {
    // Check if preset already exists for this owner
    try {
      const existing = await pb.collection('presets').getFirstListItem(`owner = "${user.id}" && name = "${preset.name.replace(/"/g, '\\"')}"`);
      if (existing) {
        skippedCount++;
        continue;
      }
    } catch {
      // not found, proceed
    }

    const payload = JSON.stringify(preset);
    await pb.collection('presets').create({
      owner: user.id,
      name: preset.name,
      description: preset.description || '',
      payload: payload,
      schemaVersion: 1,
      visibility: 'public',
      authorName: user.username,
    });
    console.log(`+ Added preset: "${preset.name}"`);
    createdCount++;
  }

  console.log(`\nDone! Created: ${createdCount}, Already existed: ${skippedCount}`);
}

main().catch((err) => {
  console.error('Error seeding presets:', err);
  process.exit(1);
});
