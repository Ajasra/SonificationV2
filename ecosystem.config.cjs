const path = require('node:path');

const appDir = __dirname;

module.exports = {
  apps: [
    {
      name: 'sonification-v2',
      script: path.join(appDir, 'pocketbase'),
      interpreter: 'none',
      cwd: appDir,
      args: [
        'serve',
        '--http=127.0.0.1:8090',
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
