const express = require('express');
const multer = require('multer');
const ensureAuth = require('../lib/ensureAuth');
const ensureNotVip = require('../lib/ensureNotVip');
const { ensureMissionAccess, ensureProcedureMissionAccess } = require('../lib/ensureMissionAccess');
require('../models/procedure'); // ensure schema is registered before controller loads
const procs = require('../controllers/procedure.controller');

module.exports = function () {
    const router = express.Router();

    // file upload (multer)
    const upload = multer({
        dest: '/tmp/quantum',
        limits: {
            fileSize: 10 * 1024 * 1024,  // 10 MB max
            files: 1                      // single file only
        },
        fileFilter: function (req, file, cb) {
            const allowed = [
                'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                'application/vnd.ms-excel'
            ];
            if (allowed.includes(file.mimetype)) {
                cb(null, true);
            } else {
                cb(new Error('Only .xlsx and .xls files are allowed'));
            }
        }
    });

    // Wrapper to catch Multer errors and return as JSON
    const uploadMiddleware = upload.single('file');
    function handleUpload(req, res, next) {
        uploadMiddleware(req, res, function (err) {
            if (err) {
                return res.status(400).json({ message: err.message || 'File upload error' });
            }
            next();
        });
    }

    // Apply ensureAuth to all procedure routes
    router.use(ensureAuth);

    // Endpoints
    router.get('/', ensureMissionAccess, procs.getProcedureList);
    router.get('/single', ensureProcedureMissionAccess, procs.getSingleProcedure);
    router.get('/data', ensureProcedureMissionAccess, procs.getProcedureData);
    router.get('/roles', procs.getQuantumRoles);
    router.post('/upload', ensureMissionAccess, handleUpload, ensureNotVip, procs.uploadFile);
    router.patch('/name', ensureProcedureMissionAccess, ensureNotVip, procs.updateProcedureName);
    
    router.get('/instances', ensureProcedureMissionAccess, procs.getAllInstances);
    router.post('/instances', ensureProcedureMissionAccess, ensureNotVip, procs.saveProcedureInstance);
    router.post('/instances/steps', ensureProcedureMissionAccess, ensureNotVip, procs.setInfo);
    router.post('/instances/complete', ensureProcedureMissionAccess, ensureNotVip, procs.setInstanceCompleted);
    router.post('/instances/comments', ensureProcedureMissionAccess, ensureNotVip, procs.setComments);
    router.get('/instances/users', ensureProcedureMissionAccess, procs.getInstanceUsers);
    router.post('/instances/user-status', ensureProcedureMissionAccess, procs.setUserStatus);
    router.post('/instances/parent-steps', ensureProcedureMissionAccess, ensureNotVip, procs.setParentsInfo);

    return router;
};
