const express = require('express');
const ensureAuth = require('../lib/ensureAuth');
const ensureLeadRole = require('../lib/ensureLeadRole');
const usr = require('../controllers/user.controller');

module.exports = function () {
    const router = express.Router();

    router.use(ensureAuth);

    router.get('/', ensureLeadRole, usr.getUsers);
    router.get('/roles', usr.getRoles);
    router.get('/missions', ensureLeadRole, usr.getMissions);
    router.get('/user-missions', ensureLeadRole, usr.getUserMissions);
    router.post('/mission', ensureLeadRole, usr.setMissionForUser);
    router.post('/mission/remove', ensureLeadRole, usr.removeMissionFromUser);
    router.get('/current-role', usr.getCurrentRole);
    router.get('/allowed-roles', usr.getAllowedRoles);
    router.post('/role', usr.setUserRole);
    router.post('/allowed-roles', ensureLeadRole, usr.setAllowedRoles);
    router.get('/role-status', usr.getUsersCurrentRole);

    return router;
};
