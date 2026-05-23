module.exports = {
  apps: [{
    name: 'creviabeauty',
    script: 'server.js',
    exec_mode: 'fork',          // single process; cluster mode is unnecessary and confuses port binding
    autorestart: true,
    watch: false,
    max_memory_restart: '500M',
    // PORT is read from .env on the VPS so the app can coexist with other PM2 apps.
    env: {
      NODE_ENV: 'production'
    }
  }]
};
