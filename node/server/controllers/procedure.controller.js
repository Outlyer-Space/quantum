var mongoose = require('mongoose');
var fs = require('fs');
var ProcedureModel = mongoose.model('procedure');
var XLSX = require("xlsx");
var configRole = require('../../config/role')
var configStep = require('../../config/step')
var validTypes = Object.keys(configStep.types);
// var validTypes = ['ACTION','CAUTION','DECISION','HEADING','INFO','RECORD','VERIFY','WARNING'];

module.exports = {
    getProcedureList: function (req, res) {
        // Build mission filter from middleware (null = no filter for lead roles)
        var query = {};

        // If the frontend sends ?mission=<name>, filter to that single mission
        if (req.query.mission) {
            query.eventname = { $regex: new RegExp('^' + req.query.mission.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$', 'i') };
        } else if (req.userMissionNames) {
            // Case-insensitive match against all of the user's missions
            query.eventname = {
                $regex: new RegExp('^(' + req.userMissionNames.map(function (n) { return n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }).join('|') + ')$', 'i')
            };
        }

        ProcedureModel.find(query, {
            procedureID: 1,
            title: 1,
            lastuse: 1,
            eventname: 1,
            'instances.running': 1
        }, function (err, procdata) {
            if (err) {
                console.log("Error finding procedures data in DB: " + err);
            }
            if (procdata) {
                res.send(procdata);
            }

        });
    },
    getSingleProcedure: function (req, res) {
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

        ProcedureModel.findOne({ 'procedureID': id }, projection, function (err, model) {
            if (err) {
                console.log(err);
                return res.status(500).json({ error: 'Internal Server Error' });
            }
            if (!model) {
                return res.status(404).json({ error: 'Not Found', message: 'Procedure not found' });
            }
            res.json(model);
        });
    },
    getProcedureData: function (req, res) {
        var id = req.query.id;

        ProcedureModel.findOne({ 'procedureID': id }, function (err, model) {
            if (err) {
                console.log(err);
                return res.status(500).json({ error: 'Internal Server Error' });
            }
            if (!model) {
                return res.status(404).json({ error: 'Not Found', message: 'Procedure not found' });
            }
            if (model) {
                var sections = model.sections;
                //convert json to worksheet
                var ws = XLSX.utils.json_to_sheet(sections, { header: ["Step", "Role", "Type", "Content", "Reference"] });
                //Give name to the worksheet
                var ws_name = "Sheet1";
                //Create a workbook object
                var wb = { SheetNames: [], Sheets: {} };

                // add worksheet to workbook
                wb.SheetNames.push(ws_name);
                wb.Sheets[ws_name] = ws;
                // write workbook object into a xlsx file
                var wbout = XLSX.write(wb, { bookType: 'xlsx', bookSST: true, type: 'binary' });
                res.send(wbout);
            }
        });
    },
    getLiveInstanceData: function (req, res) {
        var id = req.query.procedureID;
        var revision = req.query.currentRevision;

        ProcedureModel.findOne({ 'procedureID': id }, function (err, model) {
            if (err) {
                console.log(err);
                return res.status(500).json({ error: 'Internal Server Error' });
            }
            if (!model) {
                return res.status(404).json({ error: 'Not Found', message: 'Procedure not found' });
            }

            if (model) {
                var instances = model.instances;
                var liveinstance = [];

                for (var i = 0; i < instances.length; i++) {
                    if (instances[i].revision === parseInt(revision)) {
                        liveinstance = instances[i];
                    }
                }
                res.send(liveinstance);
            }

        });

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
    getInstanceUsers: function (req, res) {
        var procid = req.query.id;
        var revision = parseInt(req.query.revision, 10);

        if (!procid || isNaN(revision)) {
            return res.status(400).json({ error: 'Bad Request', message: 'id and revision are required' });
        }

        // Projection: only load revision + users fields from each instance subdocument.
        // sections, Steps, versions are NOT loaded from MongoDB at all.
        ProcedureModel.findOne(
            { 'procedureID': procid },
            { 'eventname': 1, 'instances.revision': 1, 'instances.users': 1 },
            function (err, procs) {
                if (err) {
                    console.log(err);
                    return res.status(500).json({ error: 'Internal Server Error' });
                }
                if (!procs) {
                    return res.status(404).json({ error: 'Not Found', message: 'Procedure not found' });
                }

                var inst = procs.instances.find(function (i) { return i.revision === revision; });
                if (!inst) {
                    return res.status(404).json({ error: 'Not Found', message: 'Revision not found' });
                }

                var users = inst.users || [];

                // Optional server-side callsign enrichment to avoid a second round-trip
                // to /api/users/role-status from the frontend.
                if (req.query.includeRoles === 'true' && users.length > 0) {
                    var UserModel = mongoose.model('User');
                    var missionName = (procs.eventname || '').toLowerCase();
                    var emails = users.map(function (u) { return u.email; });

                    UserModel.find(
                        { 'auth.email': { $in: emails } },
                        { 'auth.email': 1, 'missions': 1 },
                        function (err, userDocs) {
                            if (err) {
                                // Non-fatal: return users without callsigns rather than failing
                                console.warn('Could not enrich users with callsigns:', err.message);
                                return res.json({ users: users });
                            }

                            var enriched = users.map(function (u) {
                                var doc = userDocs.find(function (d) { return d.auth && d.auth.email === u.email; });
                                var missionEntry = doc && doc.missions &&
                                    doc.missions.find(function (m) { return (m.name || '').toLowerCase() === missionName; });
                                var callsign = missionEntry && missionEntry.currentRole && missionEntry.currentRole.callsign;
                                return callsign ? Object.assign({}, u.toObject ? u.toObject() : u, { callsign: callsign }) : u;
                            });

                            res.json({ users: enriched });
                        }
                    );
                } else {
                    res.json({ users: users });
                }
            }
        );
    },
    getAllInstances: function (req, res) {
        var id = req.query.procedureID;

        ProcedureModel.findOne({ 'procedureID': id }, {
            title: 1,
            'instances.revision': 1,
            'instances.version': 1,
            'instances.openedBy': 1,
            'instances.startedAt': 1,
            'instances.closedBy': 1,
            'instances.completedAt': 1,
            'instances.running': 1
        }, function (err, model) {
            if (err) {
                console.log(err);
                return res.status(500).json({ error: 'Internal Server Error' });
            }
            if (!model) {
                return res.status(404).json({ error: 'Not Found', message: 'Procedure not found' });
            }
            var allinstances = {};

            if (model) {
                var instances = model.instances;
                var allinstances = {
                    instances: instances,
                    title: model.title
                }
                res.send(allinstances);
            }

        });

    },
    uploadFile: function (req, res) {
        try {
            var filename = req.file.originalname.split(" - ");
            var filepath = req.file.path;
            var workbook = XLSX.readFile(filepath);
            // Clean up temp file now that it's been read into memory
            fs.unlink(filepath, function (unlinkErr) {
                if (unlinkErr) console.error('Failed to delete temp upload:', unlinkErr.message);
            });
            var sheet1 = XLSX.utils.sheet_to_json(workbook.Sheets.Sheet1);
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

            // check if all steps have step,type,content
            // console.log(" - Number of lines: " + sheet1.length)
            // console.log(" - Checking for required columns [Step, Role, Type]")
            for (var a = 0; a < sheet1.length; a++) {
                //if(sheet1[a].Step && sheet1[a].Role && sheet1[a].Type && sheet1[a].Content){
                if (sheet1[a].Step && sheet1[a].Role && sheet1[a].Type && sheet1[a].Content) {
                    sheet1[a].Step = sheet1[a].Step.replace(/\s/g, '');
                    sheet1[a].Role = sheet1[a].Role.replace(/\s/g, '');
                    sheet1[a].Type = sheet1[a].Type.replace(/\s/g, '');
                    fileverify++;
                }
                else {
                    errordetails = "Line " + (fileverify + 2)
                    console.log(" - ERROR: Missing field in " + errordetails)
                }
            }

            if (fileverify === sheet1.length) {
                //To check if Type is valid, check spellings and ignore case
                //It Should be one of 'Action','Caution','Decision','Heading','Info','Record','Verify','Warning'.
                var stepsValidity = 0;
                var errorTypeSteps = [];
                for (var b = 0; b < sheet1.length; b++) {
                    sheet1[b].Type = sheet1[b].Type.replace(/\s/g, '');
                    var isValid = checkTypeValidity(sheet1[b].Type);
                    if (isValid === true) {
                        stepsValidity++;
                    } else {
                        errorTypeSteps.push({ "Step": sheet1[b].Step, "Type": sheet1[b].Type });
                    }
                }

                var roleValidity = 0;
                var roleErrSteps = [];
                for (var r = 0; r < sheet1.length; r++) {
                    sheet1[r].Type = sheet1[r].Type.replace(/\s/g, '');
                    if (sheet1[r].Type.toUpperCase() !== 'HEADING') {
                        if (sheet1[r].Role) {
                            sheet1[r].Role = sheet1[r].Role.replace(/\s/g, '');
                            var isRoleValid = checkRoleValidity(sheet1[r].Role);
                            if (isRoleValid === true) {
                                roleValidity++;
                            } else {
                                roleErrSteps.push({ "Step": sheet1[r].Step, "Role": sheet1[r].Role });
                            }
                        } else {
                            roleErrSteps.push({ "Step": sheet1[r].Step, "Role": "" });
                        }
                    }
                }

                var headingSteps = 0;
                var headingErr = [];
                var nonheadingSteps = 0;
                var nonHeadingErr = [];
                if (errorTypeSteps.length === 0) {
                    if (roleErrSteps.length > 0) {
                        return res.json({ error_code: 6, err_desc: "Invalid Role", err_data: roleErrSteps });
                    }

                    if (sheet1[sheet1.length - 1].Type.toUpperCase() === 'HEADING') {
                        return res.json({ error_code: 7, err_desc: "Last Step Invalid", err_data: [{ "Step": sheet1[sheet1.length - 1].Step, "Type": sheet1[sheet1.length - 1].Type }] });
                    }

                    if (fileverify === sheet1.length) {
                        for (var c = 0; c < sheet1.length; c++) {
                            sheet1[c].Type = sheet1[c].Type.replace(/\s/g, '');
                            if (sheet1[c].Type.toUpperCase() === 'HEADING') {
                                //Get Heading type steps
                                var isHeading = getSteps(sheet1[c], true);
                                if (isHeading === true) {
                                    //headingSteps++;
                                } else {
                                    headingErr.push({ "Step": sheet1[c].Step, "Type": sheet1[c].Type });
                                }
                            } else if (sheet1[c].Type.toUpperCase() !== 'HEADING') {
                                //Get Non Heading type steps
                                var isNonHeading = getSteps(sheet1[c], false);
                                if (isNonHeading === true) {
                                    // nonheadingSteps++;
                                } else {
                                    nonHeadingErr.push({ "Step": sheet1[c].Step, "Type": sheet1[c].Type });
                                }
                            }
                        }

                        if (headingErr.length > 0 && nonHeadingErr.length > 0) {
                            return res.json({ error_code: 3, err_desc: "Not a valid Step", err_dataHeading: headingErr, err_dataNonHeading: nonHeadingErr });
                        } else if (headingErr.length > 0 && nonHeadingErr.length === 0) {
                            return res.json({ error_code: 4, err_desc: "Invalid Heading", err_data: headingErr });
                        } else if (nonHeadingErr.length > 0 && headingErr.length === 0) {
                            return res.json({ error_code: 5, err_desc: "Invalid Other Type", err_data: nonHeadingErr });
                        }
                    } else {
                        return res.json({ error_code: 0, err_desc: "Not a valid file" });
                    }
                } else if (errorTypeSteps.length > 0 && roleErrSteps.length > 0 && sheet1[sheet1.length - 1].Type.toUpperCase() === 'HEADING') {
                    return res.json({ error_code: 8, err_typedata: errorTypeSteps, err_roledata: roleErrSteps, err_data: [{ "Step": sheet1[sheet1.length - 1].Step, "Type": sheet1[sheet1.length - 1].Type }] });
                } else if (errorTypeSteps.length > 0 && roleErrSteps.length > 0 && sheet1[sheet1.length - 1].Type.toUpperCase() !== 'HEADING') {
                    return res.json({ error_code: 9, err_typedata: errorTypeSteps, err_roledata: roleErrSteps });
                } else if (errorTypeSteps.length > 0 && roleErrSteps.length === 0 && sheet1[sheet1.length - 1].Type.toUpperCase() === 'HEADING') {
                    return res.json({ error_code: 10, err_typedata: errorTypeSteps, err_data: [{ "Step": sheet1[sheet1.length - 1].Step, "Type": sheet1[sheet1.length - 1].Type }] });
                } else if (errorTypeSteps.length === 0 && roleErrSteps.length > 0 && sheet1[sheet1.length - 1].Type.toUpperCase() === 'HEADING') {
                    return res.json({ error_code: 11, err_roledata: roleErrSteps, err_data: [{ "Step": sheet1[sheet1.length - 1].Step, "Type": sheet1[sheet1.length - 1].Type }] });
                } else if (errorTypeSteps.length > 0 && roleErrSteps.length === 0 && sheet1[sheet1.length - 1].Type.toUpperCase() !== 'HEADING') {
                    return res.json({ error_code: 2, err_desc: "Step Type invalid", err_data: errorTypeSteps });
                } else if (roleErrSteps.length > 0 && errorTypeSteps.length === 0 && sheet1[sheet1.length - 1].Type.toUpperCase() !== 'HEADING') {
                    return res.json({ error_code: 6, err_desc: "Invalid Role", err_data: roleErrSteps });
                } else if (sheet1[sheet1.length - 1].Type.toUpperCase() === 'HEADING' && errorTypeSteps.length === 0 && roleErrSteps.length === 0) {
                    return res.json({ error_code: 7, err_desc: "Last Step Invalid", err_data: [{ "Step": sheet1[sheet1.length - 1].Step, "Type": sheet1[sheet1.length - 1].Type }] });
                } else {
                    return res.json({ error_code: 0, err_desc: "Not a valid file" });
                }
            } else {
                return res.json({ error_code: 0, err_desc: "Missing field", err_detail: errordetails });
            }
            //End of Validations


            //If everything is valid
            if (fileverify === sheet1.length && errorTypeSteps.length === 0 && headingErr.length === 0 && nonHeadingErr.length === 0 && roleErrSteps.length === 0 && sheet1[sheet1.length - 1].Type.toUpperCase() !== 'HEADING') {

                ProcedureModel.findOne({ 'procedureID': filename[0] }, function (err, procs) {
                    if (err) {
                        console.log(err);
                    }

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
                        procs.save(function (err, result) {
                            if (err) {
                                // throw err;
                                console.log(err);
                            }
                            if (result) {
                                console.log('procedure data updated successfully!');
                                res.json({ error_code: 0, err_desc: "file updated" });
                            }
                        });

                    } else { //Save a new procedure

                        var pfiles = new ProcedureModel();
                        // Support both 'index - title.xlsx' (new) and 'index - mission - title.xlsx' (legacy)
                        var titlePart = filename.length >= 3 ? filename[2] : filename[1];
                        var ptitle = titlePart.split(".");

                        pfiles.procedureID = filename[0].trim();
                        pfiles.title = ptitle[0].trim();
                        pfiles.lastuse = "";
                        pfiles.instances = [];
                        pfiles.versions = [];
                        pfiles.sections = []; // Explicitly initialize array

                        for (var i = 0; i < sheet1.length; i++) {
                            pfiles.sections.push(sheet1[i]);
                        }

                        pfiles.versions.push(pfiles.sections);

                        pfiles.eventname = missionName;
                        pfiles.uploadedBy = userdetails;
                        pfiles.save(function (err, result) {
                            if (err) {
                                console.log(err);
                            }
                            if (result) {
                                console.log('procedure data saved successfully!');
                                res.json({ error_code: 0, err_desc: null });
                            }
                        });
                    }
                });
            } else if (fileverify !== sheet1.length) {
                return res.json({ error_code: 0, err_desc: "Not a valid file" });
            }
        } catch (e) {
            console.log(e);
            return res.status(500).json({ error_code: 500, err_desc: "Internal Server Error" });
        }
    },
    saveProcedureInstance: function (req, res) {
        var procid = req.body.id;
        var usernamerole = req.body.usernamerole;
        var lastuse = req.body.lastuse;//start time
        var username = req.body.username;
        var useremail = req.body.email;
        var userstatus = req.body.status;

        ProcedureModel.findOne({ 'procedureID': procid }, function (err, procs) {
            if (err) {
                console.log(err);
                return res.status(500).json({ error: 'Internal Server Error' });
            }
            if (!procs) {
                return res.status(404).json({ error: 'Not Found', message: 'Procedure not found' });
            }
            if (procs) {
                var instancesteps = [];
                for (var i = 0; i < procs.sections.length; i++) {
                    instancesteps.push({ "step": procs.sections[i].Step, "info": "" })
                }
                var revision = procs.instances.length + 1;
                var versionNum = procs.versions.length;

                procs.instances.push({
                    "openedBy": usernamerole, "Steps": instancesteps, "closedBy": "", "startedAt": lastuse, "completedAt": "", "revision": procs.instances.length + 1, "running": true, users: [{
                        "name": username,
                        "email": useremail,
                        "status": userstatus
                    }], "version": versionNum
                });

                procs.lastuse = lastuse;
                procs.save(function (err, result) {
                    if (err) {
                        // throw err;
                        console.log(err);
                    }
                    if (result) {
                        res.send({ "revision": revision });
                    }
                });
            }

        });

    },
    setInfo: function (req, res) {
        var info = req.body.info;
        var procid = req.body.id;
        var step = req.body.step;
        var usernamerole = req.body.usernamerole;
        var procrevision = req.body.revision;
        var lastuse = req.body.lastuse; //time when the step was completed
        var recordedValue = req.body.recordedValue;
        var steptype = req.body.steptype;

        ProcedureModel.findOne({ 'procedureID': procid }, function (err, procs) {
            if (err) {
                console.log(err);
                return res.status(500).json({ error: 'Internal Server Error' });
            }
            if (!procs) {
                return res.status(404).json({ error: 'Not Found', message: 'Procedure not found' });
            }

            if (procs) {
                var instance = [];
                var instanceid;
                //get procedure instance with the revision num
                for (var i = 0; i < procs.instances.length; i++) {
                    if (procs.instances[i].revision === procrevision) {
                        instance = procs.instances[i].Steps;
                        instanceid = i;
                        break;
                    }
                }

                //Set info for the step of that revision
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

                procs.save(function (err, result) {
                    if (err) {
                        console.log(err);
                    }
                    if (result) {
                        res.send(result);
                    }

                });

            }
        });
    },
    setInstanceCompleted: function (req, res) {
        var info = req.body.info;
        var procid = req.body.id;
        var step = req.body.step;
        var usernamerole = req.body.usernamerole;
        var procrevision = req.body.revision;
        var lastuse = req.body.lastuse; // time when the procedure instance is completed

        ProcedureModel.findOne({ 'procedureID': procid }, function (err, procs) {
            if (err) {
                console.log(err);
                return res.status(500).json({ error: 'Internal Server Error' });
            }
            if (!procs) {
                return res.status(404).json({ error: 'Not Found', message: 'Procedure not found' });
            }

            if (procs) {
                //get procedure instance with the revision num
                for (var i = 0; i < procs.instances.length; i++) {
                    if (procs.instances[i].revision === procrevision) {
                        procs.instances[i].closedBy = usernamerole;
                        procs.instances[i].completedAt = lastuse;
                        procs.instances[i].running = false;
                        break;
                    }
                }
                procs.lastuse = lastuse;
                procs.markModified('procedure');
                procs.markModified('instances');
                procs.save(function (err, result) {
                    if (err) {
                        console.log(err);
                    }
                    if (result) {
                        res.send(result);
                    }

                });
            }

        });
    },
    setComments: function (req, res) {
        var procid = req.body.pid;
        var procrevision = req.body.prevision;
        var step = req.body.index;
        var comments = req.body.comments;
        var lastuse = req.body.lastuse; // time when the procedure instance is completed

        ProcedureModel.findOne({ 'procedureID': procid }, function (err, procs) {
            if (err) {
                console.log(err);
                return res.status(500).json({ error: 'Internal Server Error' });
            }
            if (!procs) {
                return res.status(404).json({ error: 'Not Found', message: 'Procedure not found' });
            }

            if (procs) {
                //get procedure instance with the revision num
                var instance = [];
                var instanceid;
                //get procedure instance with the revision num
                for (var i = 0; i < procs.instances.length; i++) {
                    if (parseInt(procs.instances[i].revision) === parseInt(procrevision)) {
                        instance = procs.instances[i].Steps;
                        instanceid = i;
                        break;
                    }
                }

                //Set info for the step of that revision
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
                procs.save(function (err, result) {
                    if (err) {
                        console.log(err);
                    }
                    if (result) {
                        res.send(result);
                    }

                });
            }

        });
    },
    setUserStatus: function (req, res) {
        var email = req.body.email;
        var status = req.body.status;
        var procid = req.body.pid;
        var username = req.body.username;
        var revision = req.body.revision;
        var liveinstanceID;

        ProcedureModel.findOne({ 'procedureID': procid }, function (err, procs) {
            if (err) {
                console.log(err);
                return res.status(500).json({ error: 'Internal Server Error' });
            }
            if (!procs) {
                return res.status(404).json({ error: 'Not Found', message: 'Procedure not found' });
            }

            if (procs) {

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
                                // when the user object exits already
                                procs.instances[liveinstanceID].users[i].status = status;
                                break;
                            } else if (i === len - 1) {
                                procs.instances[liveinstanceID].users.push({
                                    'name': username,
                                    'email': email,
                                    'status': status
                                });
                            }
                        }
                    } else {
                        procs.instances[liveinstanceID].users = [];
                        procs.instances[liveinstanceID].users.push({
                            'name': username,
                            'email': email,
                            'status': status
                        });
                    }
                } else {
                    //when in dashboard page or any other index page;there exists no revision num
                    //then set the status of user as false for all the revisions available in the procedure.
                    for (var i = 0; i < procs.instances.length; i++) {
                        for (var j = 0; j < procs.instances[i].users.length; j++) {
                            if (procs.instances[i].users[j].email === email) {
                                // when the user object exits already
                                procs.instances[i].users[j].status = status;
                            }
                        }
                    }
                }


                procs.markModified('instances');
                procs.save(function (err, result) {
                    if (err) {
                        console.log(err);
                    }
                    if (result) {
                        res.send({ status: status });
                    }

                });
            }
        });
    },
    updateProcedureName: function (req, res) {
        var newprocedurename = req.body.newprocedurename;
        var prevProcId = req.body.procId

        ProcedureModel.findOne({ 'procedureID': prevProcId }, function (err, procs) {
            if (err) {
                console.log(err);
                return res.status(500).json({ error: 'Internal Server Error' });
            }
            if (!procs) {
                return res.status(404).json({ error: 'Not Found', message: 'Procedure not found' });
            }

            if (procs) {
                var newMission = (newprocedurename.gname || procs.eventname || '').toLowerCase();
                // Validate the user has access to the target mission
                if (req.userMissionNames && !req.userMissionNames.some(function (n) { return n === newMission; })) {
                    return res.status(403).json({ error: 'Forbidden', message: 'You do not have access to the target mission' });
                }
                procs.procedureID = newprocedurename.id;
                procs.eventname = newMission;
                procs.title = newprocedurename.title;

                procs.save(function (err, result) {
                    if (err) {
                        console.log(err);
                    }
                    if (result) {
                        res.send(result);
                    }

                });
            }
        });

    },
    getQuantumRoles: function (req, res) {
        var callSigns = getAllCallSigns();
        res.send(callSigns);
    },
    setParentsInfo: function (req, res) {
        var info = req.body.info;
        var parentsArray = req.body.parentsArray;
        var procid = req.body.id;
        var usernamerole = req.body.usernamerole;
        var procrevision = req.body.revision;
        var lastuse = req.body.lastuse; //time when the step was completed
        var inputStepValues = req.body.inputStepValues;

        ProcedureModel.findOne({ 'procedureID': procid }, function (err, procs) {
            if (err) {
                console.log(err);
                return res.status(500).json({ error: 'Internal Server Error' });
            }
            if (!procs) {
                return res.status(404).json({ error: 'Not Found', message: 'Procedure not found' });
            }

            if (procs) {
                var instance = [];
                var instanceid;
                //get procedure instance with the revision num
                for (var i = 0; i < procs.instances.length; i++) {
                    if (procs.instances[i].revision === procrevision) {
                        instance = procs.instances[i].Steps;
                        instanceid = i;
                        break;
                    }
                }

                //Set info for the step of that revision
                for (var a = 0; a < parentsArray.length; a++) {
                    instance[parentsArray[a].index].info = info;
                    if (parentsArray[a].parent.contenttype === 'Input') {
                        instance[parentsArray[a].index].recordedValue = inputStepValues[parentsArray[a].index].ivalue;
                    }
                }


                procs.instances[instanceid].Steps = instance;
                procs.lastuse = lastuse;
                procs.markModified('procedure');
                procs.markModified('instances');

                procs.save(function (err, result) {
                    if (err) {
                        console.log(err);
                    }
                    if (result) {
                        res.send(result);
                    }

                });

            }
        });
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
        // psteps[j].Step.includes(".0") === true && psteps[j].Step.indexOf(".") === psteps[j].Step.lastIndexOf(".")
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

