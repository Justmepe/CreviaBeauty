module.exports = {
  apps: [{
    name: 'creviabeauty',
    script: 'server.js',
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '500M',
    // PORT is read from .env on the VPS (so it can coexist with other apps).
    // The values here are only a development default.
    env: {
      NODE_ENV: 'production'
    }
  }]
};
