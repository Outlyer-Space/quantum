var mongoose = require('mongoose');
var fs = require('fs');
var ProcedureModel = mongoose.model('procedure');
var ExcelJS = require('exceljs');
var configRole = require('../../config/role')
var configStep = require('../../config/step')
var validTypes = Object.keys(configStep.types);

module.exports = {
    getProcedureList: async function (req, res) {
        try {
            var query = {};

            if (req.query.mission) {
                // Use string-based $regex with $options (not new RegExp) to avoid ReDoS.
                const escaped = req.query.mission.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                query.eventname = { $regex: `^${escaped}$`, $options: 'i' };
            } else if (req.userMissionNames) {
                const escaped = req.userMissionNames.map(n => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
                query.eventname = { $regex: `^(${escaped.join('|')})$`, $options: 'i' };
            }

            const procdata = await ProcedureModel.find(query, {
                procedureID: 1,
                title: 1,
                lastuse: 1,
                eventname: 1,
                'instances.running': 1
            }).lean();

            const result = (procdata || []).map(function (p) {
                var instances = p.instances || [];
                return {
                    _id: p._id,
                    procedureID: p.procedureID,
                    title: p.title,
                    lastuse: p.lastuse,
                    eventname: p.eventname,
                    running: instances.filter(function (i) { return i.running; }).length,
                    archived: instances.filter(function (i) { return !i.running; }).length
                };
            });
            return res.json(result);
        } catch (err) {
            console.error("Error finding procedures data in DB:", err);
            return res.status(500).json({ error: 'Internal Server Error' });
        }
    },
    getSingleProcedure: async function (req, res) {
        try {
            var id = req.query.id;
            if (!id) {
                return res.status(400).json({ error: 'Bad Request', message: 'Procedure ID is required' });
            }
            var projection = {
                procedureID: 1,
                title: 1,
                eventname: 1,
                sections: 1
            };

            if (req.query.revision) {
                projection.instances = { $elemMatch: { revision: parseInt(req.query.revision, 10) } };
            }

            const model = await ProcedureModel.findOne({ 'procedureID': id }, projection).lean();
            if (!model) {
                return res.status(404).json({ error: 'Not Found', message: 'Procedure not found' });
            }
            return res.json(model);
        } catch (err) {
            console.error(err);
            return res.status(500).json({ error: 'Internal Server Error' });
        }
    },
    getProcedureData: async function (req, res) {
        try {
            var id = req.query.id;

            const model = await ProcedureModel.findOne({ 'procedureID': id }).lean();
            if (!model) {
                return res.status(404).json({ error: 'Not Found', message: 'Procedure not found' });
            }

            var sections = model.sections;

            // Create a workbook and worksheet using exceljs
            var wb = new ExcelJS.Workbook();
            var ws = wb.addWorksheet("Sheet1");
            
            // Define headers matching the original export
            ws.columns = [
                { header: "Step", key: "Step" },
                { header: "Role", key: "Role" },
                { header: "Type", key: "Type" },
                { header: "Content", key: "Content" },
                { header: "Reference", key: "Reference" }
            ];
            
            // Add rows
            sections.forEach(function(section) {
                ws.addRow(section);
            });
            
            // Write to buffer and send
            var buffer = await wb.xlsx.writeBuffer();
            return res.send(buffer);
        } catch (err) {
            console.error(err);
            return res.status(500).json({ error: 'Internal Server Error' });
        }
    },
    getLiveInstanceData: async function (req, res) {
        try {
            var id = req.query.procedureID;
            var revision = req.query.currentRevision;

            const model = await ProcedureModel.findOne({ 'procedureID': id }).lean();
            if (!model) {
                return res.status(404).json({ error: 'Not Found', message: 'Procedure not found' });
            }

            var instances = model.instances;
            var liveinstance = [];

            for (var i = 0; i < instances.length; i++) {
                if (instances[i].revision === parseInt(revision)) {
                    liveinstance = instances[i];
                }
            }
            return res.json(liveinstance);
        } catch (err) {
            console.error(err);
            return res.status(500).json({ error: 'Internal Server Error' });
        }
    },
    /**
     * Lightweight endpoint: returns only the users array for a specific instance revision.
     * Uses a MongoDB projection so the full sections/steps are never loaded from the DB.
     * Replaces the pattern of calling getSingleProcedure just to extract users.
     *
     * GET /api/procedures/instances/users?id=<procedureID>&revision=<revisionNum>
     *
     * Optional query param: ?includeRoles=true
     * When present, performs a server-side join with the User collection to attach
     * each user's current callsign for the procedure's mission, eliminating the
     * second frontend request to /api/users/role-status.
     */
    getInstanceUsers: async function (req, res) {
        try {
            var procid = req.query.id;
            var revision = parseInt(req.query.revision, 10);

            if (!procid || isNaN(revision)) {
                return res.status(400).json({ error: 'Bad Request', message: 'id and revision are required' });
            }

            // Projection: only load revision + users fields from each instance subdocument.
            // sections, Steps, versions are NOT loaded from MongoDB at all.
            const procs = await ProcedureModel.findOne(
                { 'procedureID': procid },
                { 'eventname': 1, 'instances.revision': 1, 'instances.users': 1 }
            ).lean();

            if (!procs) {
                return res.status(404).json({ error: 'Not Found', message: 'Procedure not found' });
            }

            var inst = procs.instances.find(function (i) { return i.revision === revision; });
            if (!inst) {
                return res.status(404).json({ error: 'Not Found', message: 'Revision not found' });
            }

            // role is now stored directly on each user object in the instance,
            // so no secondary UserModel lookup is needed.
            var users = inst.users || [];
            return res.json({ users: users });
        } catch (err) {
            console.error(err);
            return res.status(500).json({ error: 'Internal Server Error' });
        }
    },
    getAllInstances: async function (req, res) {
        try {
            var id = req.query.procedureID;

            const model = await ProcedureModel.findOne({ 'procedureID': id }, {
                title: 1,
                'instances.revision': 1,
                'instances.version': 1,
                'instances.openedBy': 1,
                'instances.startedAt': 1,
                'instances.closedBy': 1,
                'instances.completedAt': 1,
                'instances.running': 1
            }).lean();

            if (!model) {
                return res.status(404).json({ error: 'Not Found', message: 'Procedure not found' });
            }

            return res.json({
                instances: model.instances,
                title: model.title
            });
        } catch (err) {
            console.error(err);
            return res.status(500).json({ error: 'Internal Server Error' });
        }
    },
    uploadFile: async function (req, res) {
        try {
            var filename = req.file.originalname.split(" - ");
            var filepath = req.file.path;
            var workbook = new ExcelJS.Workbook();
            await workbook.xlsx.readFile(filepath);
            // Clean up temp file now that it's been read into memory
            fs.unlink(filepath, function (unlinkErr) {
                if (unlinkErr) console.error('Failed to delete temp upload:', unlinkErr.message);
            });
            
            var worksheet = workbook.worksheets[0];
            var sheet1 = [];
            var headers = {};
            
            // ExcelJS cells can be RichText objects, formula results, dates, etc.
            // This helper safely extracts a plain string from any cell value.
            function getCellString(cellValue) {
                if (cellValue === null || cellValue === undefined) return '';
                if (typeof cellValue === 'object' && cellValue.richText) {
                    // RichText: [{text: '...', font: {...}}, ...]
                    return cellValue.richText.map(function(r) { return r.text || ''; }).join('');
                }
                if (typeof cellValue === 'object' && cellValue.result !== undefined) {
                    // Formula cell: use the cached result
                    return String(cellValue.result);
                }
                return String(cellValue);
            }

            // Convert to JSON similar to sheet_to_json
            if (worksheet) {
                worksheet.eachRow({ includeEmpty: false }, function(row, rowNumber) {
                    if (rowNumber === 1) {
                        row.eachCell({ includeEmpty: false }, function(cell, colNumber) {
                            headers[colNumber] = getCellString(cell.value).trim() || null;
                        });
                    } else {
                        var obj = {};
                        row.eachCell({ includeEmpty: true }, function(cell, colNumber) {
                            if (headers[colNumber]) {
                                obj[headers[colNumber]] = getCellString(cell.value);
                            }
                        });
                        sheet1.push(obj);
                    }
                });
            }
            var userdetails = req.body.userdetails;
            // Mission sent explicitly from the frontend; fall back to filename[1] for
            // legacy files that still use the old 3-part 'index - mission - title.xlsx' format.
            var missionName = (req.body.mission && req.body.mission.trim())
                ? req.body.mission.trim().toLowerCase()
                : (filename.length >= 3 ? filename[1].trim().toLowerCase() : null);
            if (!missionName) {
                return res.status(400).json({ error_code: 0, err_desc: 'Mission name is required for upload.' });
            }
            // Validate the user is authorized for this mission
            if (req.userMissionNames && !req.userMissionNames.some(function (n) { return n === missionName; })) {
                return res.status(403).json({ error_code: 0, err_desc: 'You do not have access to upload to this mission.' });
            }
            var errordetails = ""

            // File Upload Validations
            console.log("Validating new file upload:")
            var fileverify = 0

            // check if all steps have step, type, content
            for (var a = 0; a < sheet1.length; a++) {
                if (sheet1[a].Step && sheet1[a].Role && sheet1[a].Type && sheet1[a].Content) {
                    sheet1[a].Step = sheet1[a].Step.replace(/\s/g, '');
                    sheet1[a].Role = sheet1[a].Role.replace(/\s/g, '');
                    sheet1[a].Type = sheet1[a].Type.replace(/\s/g, '');
                    fileverify++;
                } else {
                    errordetails = "Line " + (fileverify + 2)
                    console.log(" - ERROR: Missing field in " + errordetails)
                }
            }

            if (fileverify !== sheet1.length) {
                return res.json({ error_code: 0, err_desc: "Missing field", err_detail: errordetails });
            }

            // Check if Type is valid
            var errorTypeSteps = [];
            for (var b = 0; b < sheet1.length; b++) {
                sheet1[b].Type = sheet1[b].Type.replace(/\s/g, '');
                if (!checkTypeValidity(sheet1[b].Type)) {
                    errorTypeSteps.push({ "Step": sheet1[b].Step, "Type": sheet1[b].Type });
                }
            }

            var roleErrSteps = [];
            for (var r = 0; r < sheet1.length; r++) {
                sheet1[r].Type = sheet1[r].Type.replace(/\s/g, '');
                if (sheet1[r].Type.toUpperCase() !== 'HEADING') {
                    if (sheet1[r].Role) {
                        sheet1[r].Role = sheet1[r].Role.replace(/\s/g, '');
                        if (!checkRoleValidity(sheet1[r].Role)) {
                            roleErrSteps.push({ "Step": sheet1[r].Step, "Role": sheet1[r].Role });
                        }
                    } else {
                        roleErrSteps.push({ "Step": sheet1[r].Step, "Role": "" });
                    }
                }
            }

            var lastStep = sheet1[sheet1.length - 1];
            var lastIsHeading = lastStep.Type.toUpperCase() === 'HEADING';

            // Return specific error codes for each validation failure combination
            if (errorTypeSteps.length > 0 && roleErrSteps.length > 0 && lastIsHeading) {
                return res.json({ error_code: 8, err_typedata: errorTypeSteps, err_roledata: roleErrSteps, err_data: [{ "Step": lastStep.Step, "Type": lastStep.Type }] });
            } else if (errorTypeSteps.length > 0 && roleErrSteps.length > 0) {
                return res.json({ error_code: 9, err_typedata: errorTypeSteps, err_roledata: roleErrSteps });
            } else if (errorTypeSteps.length > 0 && lastIsHeading) {
                return res.json({ error_code: 10, err_typedata: errorTypeSteps, err_data: [{ "Step": lastStep.Step, "Type": lastStep.Type }] });
            } else if (roleErrSteps.length > 0 && lastIsHeading) {
                return res.json({ error_code: 11, err_roledata: roleErrSteps, err_data: [{ "Step": lastStep.Step, "Type": lastStep.Type }] });
            } else if (errorTypeSteps.length > 0) {
                return res.json({ error_code: 2, err_desc: "Step Type invalid", err_data: errorTypeSteps });
            } else if (roleErrSteps.length > 0) {
                return res.json({ error_code: 6, err_desc: "Invalid Role", err_data: roleErrSteps });
            } else if (lastIsHeading) {
                return res.json({ error_code: 7, err_desc: "Last Step Invalid", err_data: [{ "Step": lastStep.Step, "Type": lastStep.Type }] });
            }

            // Validate heading / non-heading step format
            var headingErr = [];
            var nonHeadingErr = [];
            for (var c = 0; c < sheet1.length; c++) {
                sheet1[c].Type = sheet1[c].Type.replace(/\s/g, '');
                if (sheet1[c].Type.toUpperCase() === 'HEADING') {
                    if (!getSteps(sheet1[c], true)) {
                        headingErr.push({ "Step": sheet1[c].Step, "Type": sheet1[c].Type });
                    }
                } else {
                    if (!getSteps(sheet1[c], false)) {
                        nonHeadingErr.push({ "Step": sheet1[c].Step, "Type": sheet1[c].Type });
                    }
                }
            }

            if (headingErr.length > 0 && nonHeadingErr.length > 0) {
                return res.json({ error_code: 3, err_desc: "Not a valid Step", err_dataHeading: headingErr, err_dataNonHeading: nonHeadingErr });
            } else if (headingErr.length > 0) {
                return res.json({ error_code: 4, err_desc: "Invalid Heading", err_data: headingErr });
            } else if (nonHeadingErr.length > 0) {
                return res.json({ error_code: 5, err_desc: "Invalid Other Type", err_data: nonHeadingErr });
            }

            // All validations passed — save to database
            const procs = await ProcedureModel.findOne({ 'procedureID': filename[0] });

            if (procs) { // Update a procedure
                // Support both 'index - title.xlsx' (new) and 'index - mission - title.xlsx' (legacy)
                var titlePart = filename.length >= 3 ? filename[2] : filename[1];
                var ptitle = titlePart.split(".");
                procs.procedureID = filename[0].trim();
                procs.title = ptitle[0].trim();
                procs.eventname = missionName;

                if (procs.versions && procs.versions.length > 0) {
                    procs.versions.push(sheet1);
                } else if (procs.versions && procs.versions.length === 0) {
                    procs.versions = [];
                    procs.versions.push(procs.sections);
                    procs.versions.push(sheet1);
                } else if (!procs.versions) {
                    procs.versions = [];
                    procs.versions.push(procs.sections);
                    procs.versions.push(sheet1);
                }
                procs.sections = [];
                for (var i = 0; i < sheet1.length; i++) {
                    procs.sections.push(sheet1[i]);
                }
                procs.updatedBy = userdetails;
                await procs.save();
                console.log('procedure data updated successfully!');
                return res.json({ error_code: 0, err_desc: "file updated" });

            } else { // Save a new procedure
                var pfiles = new ProcedureModel();
                // Support both 'index - title.xlsx' (new) and 'index - mission - title.xlsx' (legacy)
                var titlePart = filename.length >= 3 ? filename[2] : filename[1];
                var ptitle = titlePart.split(".");

                pfiles.procedureID = filename[0].trim();
                pfiles.title = ptitle[0].trim();
                pfiles.lastuse = "";
                pfiles.instanceCounter = 0;
                pfiles.instances = [];
                pfiles.versions = [];
                pfiles.sections = []; // Explicitly initialize array

                for (var i = 0; i < sheet1.length; i++) {
                    pfiles.sections.push(sheet1[i]);
                }

                pfiles.versions.push(pfiles.sections);
                pfiles.eventname = missionName;
                pfiles.uploadedBy = userdetails;
                await pfiles.save();
                console.log('procedure data saved successfully!');
                return res.json({ error_code: 0, err_desc: null });
            }
        } catch (e) {
            console.error(e);
            return res.status(500).json({ error_code: 500, err_desc: "Internal Server Error" });
        }
    },
    saveProcedureInstance: async function (req, res) {
        try {
            var procid = req.body.id;
            var usernamerole = req.body.usernamerole;
            var lastuse = req.body.lastuse; // start time
            var username = req.body.username;
            var useremail = req.body.email;
            var userrole = req.body.role;

            const procs = await ProcedureModel.findOneAndUpdate(
                { 'procedureID': procid },
                { $inc: { instanceCounter: 1 } },
                { new: true }
            );

            if (!procs) {
                return res.status(404).json({ error: 'Not Found', message: 'Procedure not found' });
            }

            var instancesteps = [];
            for (var i = 0; i < procs.sections.length; i++) {
                instancesteps.push({ "step": procs.sections[i].Step, "info": "" })
            }
            var revision = procs.instanceCounter;
            var versionNum = procs.versions.length;

            procs.instances.push({
                "openedBy": usernamerole,
                "Steps": instancesteps,
                "closedBy": "",
                "startedAt": lastuse,
                "completedAt": "",
                "revision": revision,
                "running": true,
                users: [{
                    "name": username,
                    "email": useremail,
                    "role": userrole,
                    "isOnline": true
                }],
                "version": versionNum
            });

            procs.lastuse = lastuse;
            await procs.save();
            return res.json({ "revision": revision });
        } catch (err) {
            console.error(err);
            return res.status(500).json({ error: 'Internal Server Error' });
        }
    },
    setInfo: async function (req, res) {
        try {
            var info = req.body.info;
            var procid = req.body.id;
            var step = req.body.step;
            var usernamerole = req.body.usernamerole;
            var procrevision = req.body.revision;
            var lastuse = req.body.lastuse; // time when the step was completed
            var recordedValue = req.body.recordedValue;
            var steptype = req.body.steptype;

            const procs = await ProcedureModel.findOne({ 'procedureID': procid });
            if (!procs) {
                return res.status(404).json({ error: 'Not Found', message: 'Procedure not found' });
            }

            var instance = [];
            var instanceid;
            var instanceFound = false;
            // get procedure instance with the revision num
            for (var i = 0; i < procs.instances.length; i++) {
                if (parseInt(procs.instances[i].revision, 10) === parseInt(procrevision, 10)) {
                    instance = procs.instances[i].Steps;
                    instanceid = i;
                    instanceFound = true;
                    break;
                }
            }
            if (!instanceFound) {
                console.log('Could not find instance with revision:', procrevision, 'in procedure:', procid);
                return res.status(404).json({ error: 'Not Found', message: 'Instance revision not found' });
            }

            // === ROLE-BASED ACCESS CONTROL (RBAC) ===
            const { userHasLeadRole } = require('../lib/ensureMissionAccess');
            if (!userHasLeadRole(req.user)) {
                const versionNum = procs.instances[instanceid].version;
                const stepDefinitions = (versionNum && procs.versions && procs.versions[versionNum - 1])
                                        ? procs.versions[versionNum - 1]
                                        : procs.sections;

                const requiredRoleStr = stepDefinitions[step] ? stepDefinitions[step].Role : "";

                const mission = req.user && req.user.missions
                                ? req.user.missions.find(m => m.name && m.name.toLowerCase() === (req.procMissionName || "").toLowerCase())
                                : null;
                const userCallsign = mission && mission.currentRole ? mission.currentRole.callsign : null;

                if (requiredRoleStr) {
                    if (!userCallsign) {
                        return res.status(403).json({ error: 'Forbidden', message: 'You have no assigned role for this mission.' });
                    }
                    const allowedRoles = requiredRoleStr.split(',').map(r => r.trim().toUpperCase());
                    if (!allowedRoles.includes(userCallsign.toUpperCase())) {
                        return res.status(403).json({ error: 'Forbidden', message: 'You are not authorized to execute this step.' });
                    }
                }
            }
            // === END RBAC ===

            // Set info for the step of that revision
            for (var j = 0; j < instance.length; j++) {
                if (j === step) {
                    instance[j].info = info;
                    if (steptype === 'Input') {
                        instance[j].recordedValue = recordedValue;
                    }
                    break;
                }
            }

            procs.instances[instanceid].Steps = instance;
            procs.lastuse = lastuse;
            procs.markModified('procedure');
            procs.markModified('instances');
            await procs.save();
            return res.json({ success: true });
        } catch (err) {
            console.error(err);
            return res.status(500).json({ error: 'Internal Server Error' });
        }
    },
    setInstanceCompleted: async function (req, res) {
        try {
            var info = req.body.info;
            var procid = req.body.id;
            var step = req.body.step;
            var usernamerole = req.body.usernamerole;
            var procrevision = req.body.revision;
            var lastuse = req.body.lastuse; // time when the procedure instance is completed

            const procs = await ProcedureModel.findOne({ 'procedureID': procid });
            if (!procs) {
                return res.status(404).json({ error: 'Not Found', message: 'Procedure not found' });
            }

            // get procedure instance with the revision num
            var instanceFound = false;
            for (var i = 0; i < procs.instances.length; i++) {
                if (parseInt(procs.instances[i].revision, 10) === parseInt(procrevision, 10)) {
                    procs.instances[i].closedBy = usernamerole;
                    procs.instances[i].completedAt = lastuse;
                    procs.instances[i].running = false;
                    instanceFound = true;
                    break;
                }
            }

            if (!instanceFound) {
                console.log('Could not find instance with revision:', procrevision, 'in procedure:', procid);
                return res.status(404).json({ error: 'Not Found', message: 'Instance revision not found' });
            }

            procs.lastuse = lastuse;
            procs.markModified('procedure');
            procs.markModified('instances');
            await procs.save();
            return res.json({ success: true });
        } catch (err) {
            console.error(err);
            return res.status(500).json({ error: 'Internal Server Error' });
        }
    },
    setComments: async function (req, res) {
        try {
            var procid = req.body.pid;
            var procrevision = req.body.prevision;
            var step = req.body.index;
            var comments = req.body.comments;
            var lastuse = req.body.lastuse; // time when the procedure instance is completed

            const procs = await ProcedureModel.findOne({ 'procedureID': procid });
            if (!procs) {
                return res.status(404).json({ error: 'Not Found', message: 'Procedure not found' });
            }

            // get procedure instance with the revision num
            var instance = [];
            var instanceid;
            var instanceFound = false;
            for (var i = 0; i < procs.instances.length; i++) {
                if (parseInt(procs.instances[i].revision, 10) === parseInt(procrevision, 10)) {
                    instance = procs.instances[i].Steps;
                    instanceid = i;
                    instanceFound = true;
                    break;
                }
            }
            if (!instanceFound) {
                console.log('Could not find instance with revision:', procrevision, 'in procedure:', procid);
                return res.status(404).json({ error: 'Not Found', message: 'Instance revision not found' });
            }

            // Set info for the step of that revision
            for (var j = 0; j < instance.length; j++) {
                if (j === step) {
                    instance[j].comments = comments;
                    break;
                }
            }

            procs.instances[instanceid].Steps = instance;
            procs.lastuse = lastuse;
            procs.markModified('procedure');
            procs.markModified('instances');
            await procs.save();
            return res.json({ success: true });
        } catch (err) {
            console.error(err);
            return res.status(500).json({ error: 'Internal Server Error' });
        }
    },
    setUserStatus: async function (req, res) {
        try {
            var email = req.body.email;
            var isOnline = req.body.isOnline;
            var procid = req.body.pid;
            var username = req.body.username;
            var revision = req.body.revision;
            var liveinstanceID;

            const procs = await ProcedureModel.findOne({ 'procedureID': procid });
            if (!procs) {
                return res.status(404).json({ error: 'Not Found', message: 'Procedure not found' });
            }

            for (var i = 0; i < procs.instances.length; i++) {
                if (parseInt(procs.instances[i].revision) === parseInt(revision) && revision !== "") {
                    liveinstanceID = i;
                    break;
                } else if (revision === "") {
                    liveinstanceID = "";
                }
            }

            if (liveinstanceID !== "") {
                if (procs.instances[liveinstanceID].users && procs.instances[liveinstanceID].users.length > 0) {
                    var len = procs.instances[liveinstanceID].users.length;
                    for (var i = 0; i < len; i++) {
                        if (procs.instances[liveinstanceID].users[i].email === email) {
                            // when the user object exists already
                            procs.instances[liveinstanceID].users[i].isOnline = isOnline;
                            break;
                        } else if (i === len - 1) {
                            procs.instances[liveinstanceID].users.push({
                                'name': username,
                                'email': email,
                                'role': procs.instances[liveinstanceID].users[0]?.role || '',
                                'isOnline': isOnline
                            });
                        }
                    }
                } else {
                    procs.instances[liveinstanceID].users = [];
                    procs.instances[liveinstanceID].users.push({
                        'name': username,
                        'email': email,
                        'role': '',
                        'isOnline': isOnline
                    });
                }
            } else {
                // when in dashboard page or any other index page; there exists no revision num.
                // Set the status of user as false for all the revisions available in the procedure.
                for (var i = 0; i < procs.instances.length; i++) {
                    for (var j = 0; j < procs.instances[i].users.length; j++) {
                        if (procs.instances[i].users[j].email === email) {
                            // when the user object exists already
                            procs.instances[i].users[j].isOnline = isOnline;
                        }
                    }
                }
            }

            procs.markModified('instances');
            await procs.save();
            return res.json({ isOnline: isOnline });
        } catch (err) {
            console.error(err);
            return res.status(500).json({ error: 'Internal Server Error' });
        }
    },
    updateProcedureName: async function (req, res) {
        try {
            var newprocedurename = req.body.newprocedurename;
            var prevProcId = req.body.procId;

            const procs = await ProcedureModel.findOne({ 'procedureID': prevProcId });
            if (!procs) {
                return res.status(404).json({ error: 'Not Found', message: 'Procedure not found' });
            }

            var newMission = (newprocedurename.gname || procs.eventname || '').toLowerCase();
            // Validate the user has access to the target mission
            if (req.userMissionNames && !req.userMissionNames.some(function (n) { return n === newMission; })) {
                return res.status(403).json({ error: 'Forbidden', message: 'You do not have access to the target mission' });
            }
            procs.procedureID = newprocedurename.id;
            procs.eventname = newMission;
            procs.title = newprocedurename.title;
            await procs.save();
            return res.json({ success: true });
        } catch (err) {
            console.error(err);
            return res.status(500).json({ error: 'Internal Server Error' });
        }
    },
    getQuantumRoles: function (req, res) {
        var callSigns = getAllCallSigns();
        return res.json(callSigns);
    },
    setParentsInfo: async function (req, res) {
        try {
            var info = req.body.info;
            var parentsArray = req.body.parentsArray;
            var procid = req.body.id;
            var usernamerole = req.body.usernamerole;
            var procrevision = req.body.revision;
            var lastuse = req.body.lastuse; // time when the step was completed
            var inputStepValues = req.body.inputStepValues;

            // Security: validate parentsArray is an array with safe non-negative integer indexes
            if (!Array.isArray(parentsArray)) {
                return res.status(400).json({ error: 'Bad Request', message: 'parentsArray must be an array' });
            }
            for (var k = 0; k < parentsArray.length; k++) {
                const idx = parentsArray[k].index;
                if (!Number.isInteger(idx) || idx < 0) {
                    return res.status(400).json({ error: 'Bad Request', message: 'Invalid step index in parentsArray' });
                }
            }

            const procs = await ProcedureModel.findOne({ 'procedureID': procid });
            if (!procs) {
                return res.status(404).json({ error: 'Not Found', message: 'Procedure not found' });
            }

            var instance = [];
            var instanceid;
            var instanceFound = false;
            // get procedure instance with the revision num
            for (var i = 0; i < procs.instances.length; i++) {
                if (parseInt(procs.instances[i].revision, 10) === parseInt(procrevision, 10)) {
                    instance = procs.instances[i].Steps;
                    instanceid = i;
                    instanceFound = true;
                    break;
                }
            }
            if (!instanceFound) {
                console.log('Could not find instance with revision:', procrevision, 'in procedure:', procid);
                return res.status(404).json({ error: 'Not Found', message: 'Instance revision not found' });
            }

            // Set info for the step of that revision
            for (var a = 0; a < parentsArray.length; a++) {
                const idx = parentsArray[a].index;
                // Security: bounds-check index before using it as an array subscript
                if (idx >= instance.length) {
                    return res.status(400).json({ error: 'Bad Request', message: 'Step index out of bounds' });
                }
                instance[idx].info = info;
                if (parentsArray[a].parent.contenttype === 'Input') {
                    instance[idx].recordedValue = inputStepValues[idx].ivalue;
                }
            }

            procs.instances[instanceid].Steps = instance;
            procs.lastuse = lastuse;
            procs.markModified('procedure');
            procs.markModified('instances');
            await procs.save();
            return res.json({ success: true });
        } catch (err) {
            console.error(err);
            return res.status(500).json({ error: 'Internal Server Error' });
        }
    }
};

function checkTypeValidity(stepType) {
    var typeOfStep = stepType.replace(/\s/g, '');
    if (validTypes.includes(typeOfStep.toUpperCase())) {
        return true
    } else {
        return false;
    }
}

function getSteps(stepNum, isHeading) {
    var step = stepNum.Step.replace(/\s/g, '');
    if (isHeading === true) {
        if (step.includes(".0") === true && step.lastIndexOf("0") === step.length - 1 && step.lastIndexOf(".") === step.length - 2) {
            return true;
        } else {
            return false;
        }
    } else if (isHeading === false) {
        if (step.includes(".0") === false) {
            return true;
        } else {
            return false;
        }
    }
}

function getAllCallSigns() {
    var callSigns = [];
    var roleKeys = Object.keys(configRole.roles);
    for (var i = 0; i < roleKeys.length; i++) {
        callSigns.push(configRole.roles[roleKeys[i]].callsign);
    }
    return callSigns;
}

function checkRoleValidity(stepRole) {
    var callSigns = getAllCallSigns();
    var tempRoles = [];
    var str = stepRole.replace(/\s/g, '');
    if (stepRole.includes(",")) {
        tempRoles = str.split(',');
    } else {
        tempRoles.push(str);
    }
    if (tempRoles.length === 1) {
        if (callSigns.includes(str)) {
            return true;
        } else {
            return false;
        }
    } else if (tempRoles.length > 1) {
        var roleCount = 0;
        for (var a = 0; a < tempRoles.length; a++) {
            if (callSigns.includes(tempRoles[a].toUpperCase())) {
                roleCount++;
            } else {
                return false;
            }
        }

        if (roleCount === tempRoles.length) {
            return true;
        }
    }
}
