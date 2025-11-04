/**
 * System Controller
 * Handles system-level operations like version info, health checks, etc.
 */

/**
 * Get application version and git information
 */
exports.getVersion = function(req, res) {
    try {
        const versionInfo = {
            branch: process.env.GIT_BRANCH || 'unknown',
            commit: process.env.GIT_COMMIT || 'unknown',
            version: require('../../package.json').version
        };
        
        res.json(versionInfo);
    } catch (error) {
        console.error('Error fetching version info:', error);
        res.status(500).json({
            error: 'Failed to retrieve version information'
        });
    }
};