// PM2 process manager config
// Usage: pm2 start ecosystem.config.js --env production
module.exports = {
  apps: [
    {
      name: 'bd-ecommerce-api',
      script: 'server.js',
      instances: 'max',       // cluster mode — use all CPU cores
      exec_mode: 'cluster',
      env: {
        NODE_ENV: 'development',
        PORT: 5000,
      },
      env_production: {
        NODE_ENV: 'production',
        PORT: 5000,
      },
      error_file: 'logs/pm2-error.log',
      out_file: 'logs/pm2-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      max_memory_restart: '500M',
      restart_delay: 3000,
      watch: false,
    },
  ],
};
