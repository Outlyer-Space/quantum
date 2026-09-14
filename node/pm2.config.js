module.exports = {
    apps: [{
        name: 'quantum',
        script: 'server.js',
        instances: 0,
        exec_mode: 'cluster',
        watch: true,
        "max_restarts": 3,
        "min_uptime": 10000,
        log_date_format: "YYYY-MM-DD HH:mm:ss Z",
    }]
};