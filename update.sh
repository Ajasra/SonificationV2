#!/usr/bin/env bash
set -e

git pull
npm install --include=dev
npm run build:backend
sudo -u www-data -H pm2 startOrRestart ecosystem.config.cjs --update-env
sudo -u www-data -H pm2 save
