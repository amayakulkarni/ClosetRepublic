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
    {
      // Discord membership bot (bot/index.mjs). Start it once config/discord-tiers.json is in place:
      //   pm2 start ecosystem.config.cjs --only cr-discord-bot && pm2 save
      name: 'cr-discord-bot',
      cwd: __dirname,
      script: 'bot/index.mjs',
      env: { NODE_ENV: 'production' },
      instances: 1,
      autorestart: true,
      // Waits a little longer between restarts, so a bad token doesn't hammer Discord.
      restart_delay: 10000,
      // Ambient sound (voice libraries, up to seven Discord connections) needs more room than the
      // membership bot alone; at 256M pm2 stopped the bot every few minutes (exit code 0).
      max_memory_restart: '768M',
    },
  ],
};
