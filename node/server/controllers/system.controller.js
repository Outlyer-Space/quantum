/**
 * System Controller
 * Handles system-level operations like version info, health checks, etc.
 */

/**
 * Get application version and git information
 */
exports.getVersion = async function(req, res) {
    try {
        const mongoose = require('mongoose');
        
        let dbUrl = 'Unknown';
        let dbVersion = 'Unknown';

        if (mongoose.connection.readyState === 1) {
            // Get the connection URL (fallback to host/name if full URL isn't readily available)
            if (mongoose.connection.client && mongoose.connection.client.s && mongoose.connection.client.s.url) {
                try {
                    const parsedUrl = new URL(mongoose.connection.client.s.url);
                    parsedUrl.username = '';
                    parsedUrl.password = '';
                    parsedUrl.search = '';
                    dbUrl = parsedUrl.toString();
                } catch (e) {
                    // Fallback string replacement if URL parsing fails
                    dbUrl = mongoose.connection.client.s.url.split('?')[0].replace(/\/\/[^@]+@/, '//');
                }
            } else if (mongoose.connection.host) {
                dbUrl = `${mongoose.connection.host}:${mongoose.connection.port}/${mongoose.connection.name}`;
            }

            // Get DB version
            try {
                if (mongoose.connection.db) {
                    const adminDb = mongoose.connection.db.admin();
                    const serverInfo = await adminDb.serverInfo();
                    dbVersion = serverInfo.version;
                }
            } catch (e) {
                console.error('Failed to get mongo version:', e);
            }
        }

        const versionInfo = {
            branch: process.env.GIT_BRANCH || 'unknown',
            commit: process.env.GIT_COMMIT || 'unknown',
            version: process.env.APP_VERSION || 'unknown',
            dbUrl: dbUrl,
            dbVersion: dbVersion
        };
        
        res.json(versionInfo);
    } catch (error) {
        console.error('Error fetching version info:', error);
        res.status(500).json({
            error: 'Failed to retrieve version information'
        });
    }
};

/**
 * Get current server and database status
 */
exports.getStatus = function(req, res) {
    try {
        const mongoose = require('mongoose');
        
        // 1 = connected, 2 = connecting. Anything else is considered offline/error for our purposes.
        const isDbConnected = mongoose.connection.readyState === 1 || mongoose.connection.readyState === 2;
        
        res.json({
            server: 'OKAY',
            database: isDbConnected ? 'OKAY' : 'OFFLINE',
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        console.error('Error fetching system status:', error);
        res.status(500).json({
            error: 'Failed to retrieve system status'
        });
    }
};