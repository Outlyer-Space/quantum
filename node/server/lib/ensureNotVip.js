module.exports = function ensureNotVip(req, res, next) {
    if (!req.user || !req.user.missions) return res.status(401).send();

    // 1. Procedure-specific context (populated by ensureProcedureMissionAccess)
    // 2. Upload context (populated by multer processing req.body)
    const missionName = req.procMissionName || (req.body && req.body.mission);

    if (missionName) {
        const m = req.user.missions.find(m => m.name && m.name.toLowerCase() === missionName.toLowerCase());
        if (m && m.currentRole && m.currentRole.callsign === 'VIP') {
            return res.status(403).json({ error: 'Forbidden', message: 'Observers (VIP) cannot modify data in this mission.' });
        }
    } else {
        // Fallback: If no mission context is found, check if all their current roles are VIP
        const allVip = req.user.missions.length > 0 && req.user.missions.every(m => m.currentRole && m.currentRole.callsign === 'VIP');
        if (allVip) {
            return res.status(403).json({ error: 'Forbidden', message: 'Observers (VIP) cannot modify data.' });
        }
    }

    next();
};
