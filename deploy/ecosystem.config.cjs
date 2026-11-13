// PM2: menjalankan API sebagai service yang otomatis restart.
// pm2 start deploy/ecosystem.config.cjs && pm2 save && pm2 startup
module.exports = {
  apps: [
    {
      name: 'po-system-api',
      cwd: '/var/www/po-system/backend',
      script: 'dist/server.js',
      instances: 1,
      exec_mode: 'fork',
      max_memory_restart: '512M',
      env: { NODE_ENV: 'production', HOST: '127.0.0.1', PORT: 4000 },
      out_file: '/var/log/po-system/api.out.log',
      error_file: '/var/log/po-system/api.err.log',
      time: true,
    },
  ],
};
