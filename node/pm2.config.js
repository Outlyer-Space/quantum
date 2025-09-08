module.exports = {
    apps : [{
        name            : 'quantum',
        script          : 'server.js',
        watch           : true,
        "max_restarts"  : 3,
        "min_uptime"    : 10000,
        log_date_format : "YYYY-MM-DD HH:mm:ss Z",
    }]
};