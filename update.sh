#!/usr/bin/env bash
set -e

git pull
npm install --include=dev
npm run build:backend
sudo -u www-data -H pm2 restart sonification-v2