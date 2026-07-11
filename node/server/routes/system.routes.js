const express = require('express');
const ensureAuth = require('../lib/ensureAuth');
const system = require('../controllers/system.controller');

module.exports = function () {
    const router = express.Router();

    router.use(ensureAuth);

    router.get('/version', system.getVersion);
    router.get('/status', system.getStatus);

    return router;
};
