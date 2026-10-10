const fs = require('node:fs');
const path = require('node:path');

const appDir = __dirname;

let port = process.env.PB_PORT || process.env.PORT;
if (!port && fs.existsSync(path.join(appDir, '.env'))) {
  const envContent = fs.readFileSync(path.join(appDir, '.env'), 'utf8');
  const match = envContent.match(/^\s*PB_PORT\s*=\s*(\d+)/m);
  if (match) port = match[1];
}
port = port || '38472';

module.exports = {
  apps: [
    {
      name: 'sonification-v2',
      script: path.join(appDir, 'pocketbase'),
      interpreter: 'none',
      cwd: appDir,
      args: [
        'serve',
        `--http=127.0.0.1:${port}`,
        `--dir=${path.join(appDir, 'pb_data')}`,
        `--publicDir=${path.join(appDir, 'pb_public')}`,
        `--migrationsDir=${path.join(appDir, 'pb_migrations')}`,
        `--hooksDir=${path.join(appDir, 'pb_hooks')}`,
      ],
      exec_mode: 'fork',
      instances: 1,
      autorestart: true,
      restart_delay: 3000,
      time: true,
    },
  ],
};
