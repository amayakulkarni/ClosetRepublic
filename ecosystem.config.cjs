// pm2 start ecosystem.config.cjs && pm2 save
module.exports = {
  apps: [
    {
      name: 'closet-republic',
      cwd: __dirname,
      script: 'node_modules/next/dist/bin/next',
      args: 'start -p 40001',
      env: { NODE_ENV: 'production', NEXT_TELEMETRY_DISABLED: '1' },
      // One instance: the SQLite treasury is a single file.
      instances: 1,
      autorestart: true,
      max_memory_restart: '512M',
    },
  ],
};
