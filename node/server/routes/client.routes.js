const express = require('express');
const path = require('path');

module.exports = function () {
    const router = express.Router();

    router.get('/{*splat}', function (req, res) {
        res.sendFile(path.join(__dirname, '../../public/index.html'));
    });

    return router;
};
