/**
 * PM2 definition for the research engine on the VPS.
 *
 *   pm2 start engine/ecosystem.config.js && pm2 save
 *
 * Runs --discover on a 24h internal loop. watch MUST stay false: the engine
 * writes prompts into engine/output/, and PM2 file-watching would restart it
 * on its own output, interrupting every run.
 */
module.exports = {
    apps: [{
        name: 'creviabeauty-research',
        cwd: '/var/www/creviabeauty',
        script: 'engine/research.py',
        interpreter: '/var/www/creviabeauty/engine/venv/bin/python',
        args: ['--discover', '--watch', '24'],
        watch: false,
        autorestart: true,
        restart_delay: 60000,
        max_restarts: 10,
        env: {
            CREVIA_SITE_URL: 'http://localhost:3010'
        }
    }]
};
