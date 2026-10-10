import fs from 'node:fs';
import path from 'node:path';
import PocketBase from 'pocketbase';

const appDir = process.cwd();

// Load .env
let envConfig = {};
if (fs.existsSync(path.join(appDir, '.env'))) {
  const envContent = fs.readFileSync(path.join(appDir, '.env'), 'utf8');
  for (const line of envContent.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx > 0) {
      const k = trimmed.slice(0, eqIdx).trim();
      const v = trimmed.slice(eqIdx + 1).trim();
      envConfig[k] = v;
    }
  }
}

const adminEmail = process.env.POCKET_ADMIN || envConfig.POCKET_ADMIN || process.env.PB_ADMIN_EMAIL || envConfig.PB_ADMIN_EMAIL || 'b@vasily.onl';
const adminPass = process.env.POCKET_PASS || envConfig.POCKET_PASS || process.env.PB_ADMIN_PASSWORD || envConfig.PB_ADMIN_PASSWORD || '';
const port = process.env.PB_PORT || envConfig.PB_PORT || '38472';
const pbUrl = process.env.PB_URL || process.env.VITE_POCKETBASE_URL || envConfig.VITE_POCKETBASE_URL || `http://127.0.0.1:${port}`;

console.log('--- Sonification V2 Production Preset Seeder ---');
console.log(`Connecting to PocketBase at: ${pbUrl}`);
console.log(`Admin identity: ${adminEmail}`);

async function main() {
  const pb = new PocketBase(pbUrl);
  pb.autoCancellation(false);

  let authenticated = false;
  let authType = '';

  // 1. Try authenticating as superuser
  if (adminEmail && adminPass) {
    try {
      console.log('Attempting superuser authentication...');
      await pb.collection('_superusers').authWithPassword(adminEmail, adminPass);
      authenticated = true;
      authType = 'superuser';
      console.log('✓ Successfully authenticated as _superuser.');
    } catch (err) {
      console.log(`Note: _superusers auth: ${err.message}`);
    }
  }

  // 2. If superuser failed, try regular users auth
  if (!authenticated && adminPass) {
    for (const identity of [adminEmail, 'vasily', 'b']) {
      try {
        console.log(`Attempting auth with users collection as "${identity}"...`);
        await pb.collection('users').authWithPassword(identity, adminPass);
        authenticated = true;
        authType = 'user';
        console.log(`✓ Successfully authenticated as user "${identity}".`);
        break;
      } catch {
        // try next
      }
    }
  }

  if (!authenticated) {
    console.error('\n[ERROR] Could not authenticate with PocketBase.');
    console.error('Make sure POCKET_ADMIN and POCKET_PASS in .env are correct.');
    console.error('Or run on the server via PocketBase migration (pb_migrations/1760100000_seed_default_presets.js).');
    process.exit(1);
  }

  // Load curated presets from factory-presets.ts
  const ts = (await import('typescript')).default;
  const tsContent = fs.readFileSync(path.join(appDir, 'src/presets/factory-presets.ts'), 'utf8');
  const compiled = ts.transpileModule(tsContent, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  const modExports = {};
  new Function('exports', compiled)(modExports);
  const factoryPresets = modExports.FACTORY_PRESETS || [];
  console.log(`Loaded ${factoryPresets.length} curated presets from factory-presets.ts.`);

  // Find target user owner
  let ownerUser;
  if (authType === 'user') {
    ownerUser = pb.authStore.record;
  } else {
    try {
      ownerUser = await pb.collection('users').getFirstListItem('username = "vasily"');
    } catch {
      try {
        const users = await pb.collection('users').getList(1, 1);
        if (users.items.length) ownerUser = users.items[0];
      } catch {}
    }
  }

  if (!ownerUser) {
    console.error('[ERROR] Could not determine owner user record for presets.');
    process.exit(1);
  }
  console.log(`Using owner user: ID=${ownerUser.id}, Username=${ownerUser.username}`);

  // Fetch and remove existing presets
  console.log('\nQuerying existing presets in database...');
  let existingList = [];
  try {
    const res = await pb.collection('presets').getFullList({ sort: '-created' });
    existingList = res;
    console.log(`Found ${existingList.length} existing presets.`);
  } catch (err) {
    console.log(`Error querying presets: ${err.message}`);
  }

  if (existingList.length > 0) {
    console.log('Removing existing presets...');
    let deletedCount = 0;
    for (const item of existingList) {
      try {
        await pb.collection('presets').delete(item.id);
        deletedCount++;
      } catch (err) {
        console.warn(`Could not delete preset "${item.name}" (${item.id}): ${err.message}`);
      }
    }
    console.log(`✓ Deleted ${deletedCount} existing presets.`);
  }

  // Seed 20 curated presets
  console.log('\nSeeding 20 curated presets...');
  let createdCount = 0;
  for (const preset of factoryPresets) {
    const payload = JSON.stringify(preset);
    const data = {
      owner: ownerUser.id,
      name: preset.name,
      description: preset.description || '',
      payload: payload,
      schemaVersion: 1,
      visibility: 'public',
      authorName: ownerUser.username || 'vasily',
      isDefault: true,
    };

    try {
      await pb.collection('presets').create(data);
      console.log(`  + [DEFAULT] Seeded: "${preset.name}"`);
      createdCount++;
    } catch (err) {
      // If isDefault field is not on the collection yet, retry without isDefault
      if (err.data && err.data.isDefault) {
        delete data.isDefault;
        await pb.collection('presets').create(data);
        console.log(`  + Seeded (without isDefault flag): "${preset.name}"`);
        createdCount++;
      } else {
        console.error(`  x Failed to create "${preset.name}":`, err.message);
      }
    }
  }

  console.log(`\n========================================`);
  console.log(`Done! Successfully seeded ${createdCount} curated default presets.`);
  console.log(`========================================\n`);
}

main().catch((err) => {
  console.error('[FATAL] Seeding failed:', err);
  process.exit(1);
});
