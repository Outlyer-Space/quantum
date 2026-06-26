/**
 * Express middleware: ensures the authenticated user holds a lead role
 * (FLIGHT, MD, or TD) for the requested mission.
 *
 * Lead roles are the only roles permitted to perform user-administration
 * actions such as viewing the user list or changing allowed roles.
 *
 * The mission name is read from req.query.mission (GET) or req.body.mission (POST).
 */

const LEAD_ROLES = ['FLIGHT', 'MD', 'TD'];

module.exports = async function ensureLeadRole(req, res, next) {
    if (!req.isAuthenticated || !req.isAuthenticated()) {
        return res.status(401).json({ error: 'Unauthorized', message: 'User is not authenticated' });
    }

    const mission = req.query.mission || req.body.mission;

    if (!mission) {
        return res.status(400).json({ error: 'Bad Request', message: 'Mission parameter is required for authorization' });
    }

    try {
        // Look up the user fresh from the database using their email
        // (more reliable than _id which may differ between passport strategies)
        const User = require('mongoose').model('User');
        const email = req.user && req.user.auth && req.user.auth.email;

        if (!email) {
            return res.status(403).json({ error: 'Forbidden', message: 'Cannot determine user identity' });
        }

        const user = await User.findOne({ 'auth.email': email }).lean();

        if (!user || !user.missions || user.missions.length === 0) {
            return res.status(403).json({ error: 'Forbidden', message: 'User has no assigned missions' });
        }

        // Case-insensitive mission lookup to handle 'Quantum' vs 'quantum'
        const missionLower = mission.toLowerCase();
        const userMission = user.missions.find(m => m.name && m.name.toLowerCase() === missionLower);

        if (!userMission) {
            return res.status(403).json({ error: 'Forbidden', message: `User is not part of mission: ${mission}` });
        }

        const currentRole = userMission.currentRole;

        if (!currentRole || !currentRole.callsign) {
            return res.status(403).json({ error: 'Forbidden', message: 'User has no active role in this mission' });
        }

        if (!LEAD_ROLES.includes(currentRole.callsign.toUpperCase())) {
            return res.status(403).json({
                error: 'Forbidden',
                message: `Role ${currentRole.callsign} is not authorized for this action. Lead role required.`
            });
        }

        // User is authorized — proceed
        next();

    } catch (error) {
        console.error('Error in ensureLeadRole middleware:', error);
        return res.status(500).json({ error: 'Internal Server Error', message: 'Failed to authorize user role' });
    }
};
