module.exports = {
    apps: [{
        name: 'quantum',
        script: 'server.js',
        // watch:true restarts workers whenever a file changes on disk. In
        // production that is unwanted churn, and with an ephemeral session secret
        // each restart mints a new key and silently invalidates every session.
        watch: process.env.PM2_WATCH === 'true',
        "max_restarts": 3,
        "min_uptime": 10000,
        log_date_format: "YYYY-MM-DD HH:mm:ss Z"
    }]
};