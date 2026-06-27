/**
 * Express middleware: ensures the authenticated user belongs to the mission
 * associated with the requested procedure(s).
 *
 * For list endpoints, it attaches req.userMissionNames so controllers can
 * filter results to only the user's missions.
 *
 * For single-procedure endpoints (by procedureID), it fetches the procedure
 * and verifies the user belongs to its eventname mission.
 *
 * Lead roles (FLIGHT, MD, TD) bypass mission filtering and can see all procedures.
 */

const LEAD_ROLES = ['FLIGHT', 'MD', 'TD'];

/**
 * Extracts the mission names from the authenticated user's missions array.
 * Returns an array of lowercase mission name strings.
 */
function getUserMissionNames(user) {
    if (!user || !user.missions || !Array.isArray(user.missions)) {
        return [];
    }
    return user.missions
        .filter(m => m && m.name)
        .map(m => m.name.toLowerCase());
}

/**
 * Checks whether the user holds a lead role in any of their missions.
 */
function userHasLeadRole(user) {
    if (!user || !user.missions || !Array.isArray(user.missions)) {
        return false;
    }
    return user.missions.some(m => {
        const callsign = m.currentRole && m.currentRole.callsign;
        return callsign && LEAD_ROLES.includes(callsign.toUpperCase());
    });
}

/**
 * Middleware that populates req.userMissionNames for list-based filtering.
 * If the user has a lead role, req.userMissionNames is set to null (no filter).
 */
function ensureMissionAccess(req, res, next) {
    if (!req.isAuthenticated || !req.isAuthenticated()) {
        return res.status(401).json({ error: 'Unauthorized', message: 'User is not authenticated' });
    }

    // Lead roles can access all procedures
    if (userHasLeadRole(req.user)) {
        req.userMissionNames = null; // null = no filtering
        return next();
    }

    const missionNames = getUserMissionNames(req.user);

    if (missionNames.length === 0) {
        return res.status(403).json({
            error: 'Forbidden',
            message: 'User has no assigned missions'
        });
    }

    req.userMissionNames = missionNames;
    next();
}

/**
 * Middleware that checks a specific procedure (looked up by procedureID)
 * belongs to one of the user's missions.
 *
 * The procedureID is read from req.query.id, req.query.procedureID,
 * req.body.id, or req.body.pid — matching the existing controller patterns.
 */
function ensureProcedureMissionAccess(req, res, next) {
    if (!req.isAuthenticated || !req.isAuthenticated()) {
        return res.status(401).json({ error: 'Unauthorized', message: 'User is not authenticated' });
    }

    // Lead roles bypass
    if (userHasLeadRole(req.user)) {
        req.userMissionNames = null; // null = no filtering
        return next();
    }

    const missionNames = getUserMissionNames(req.user);

    if (missionNames.length === 0) {
        return res.status(403).json({
            error: 'Forbidden',
            message: 'User has no assigned missions'
        });
    }

    // Extract procedureID from multiple possible locations
    const procedureID = req.query.id || req.query.procedureID || req.body.id || req.body.pid || req.body.procId;

    if (!procedureID) {
        return res.status(400).json({
            error: 'Bad Request',
            message: 'Procedure ID is required'
        });
    }

    const ProcedureModel = require('mongoose').model('procedure');

    ProcedureModel.findOne({ procedureID: procedureID }, 'eventname', function (err, proc) {
        if (err) {
            console.error('Error checking procedure mission access:', err);
            return res.status(500).json({ error: 'Internal Server Error' });
        }

        if (!proc) {
            return res.status(404).json({ error: 'Not Found', message: 'Procedure not found' });
        }

        // Case-insensitive comparison of procedure's eventname against user's missions
        const procMission = proc.eventname ? proc.eventname.toLowerCase() : '';
        const hasAccess = missionNames.some(name => name.toLowerCase() === procMission);

        if (!hasAccess) {
            return res.status(403).json({
                error: 'Forbidden',
                message: 'You do not have access to procedures in this mission'
            });
        }

        req.userMissionNames = missionNames;
        req.procMissionName = procMission;
        next();
    });
}

module.exports = {
    ensureMissionAccess,
    ensureProcedureMissionAccess,
    getUserMissionNames,
    userHasLeadRole
};
