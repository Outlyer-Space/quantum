// PM2_INSTANCES pins the worker count without a rebuild — set it as a Container
// App environment variable. Unset (or 0) means one worker per CPU core.
//
// Set PM2_INSTANCES=1 to run a single worker. If SESSION_SECRET is unset, every
// worker signs cookies with its own random key, so a request that lands on a
// different worker than the one that issued the cookie fails signature
// verification and returns 401 session_not_authenticated mid-session. Collapsing
// to one worker removes the hop and, if that is the fault, the 401s stop.
//
// NOTE: this only removes workers WITHIN a container. Azure Container Apps can
// run several replicas, each with its own process — so for a conclusive test the
// Container App scale rule must also be pinned to min=max=1 replica.
const instances = parseInt(process.env.PM2_INSTANCES, 10) || 0;

module.exports = {
    apps: [{
        name: 'quantum',
        script: 'server.js',
        instances: instances,
        exec_mode: 'cluster',
        // watch:true restarts workers whenever a file changes on disk. In
        // production that is unwanted churn, and with an ephemeral session secret
        // each restart mints a new key and silently invalidates every session.
        watch: process.env.PM2_WATCH === 'true',
        "max_restarts": 3,
        "min_uptime": 10000,
        log_date_format: "YYYY-MM-DD HH:mm:ss Z",
    }]
};