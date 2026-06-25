var mongoose = require('mongoose');
var User = mongoose.model('User');
var multer = require('multer');
var XLSX = require("xlsx");
var configRole = require('../../config/role');

module.exports = {
    getCurrentRole: async function (req, res) {
        try {
            const { email } = req.query;
            const mission = (req.query.mission || '').toLowerCase();

            if (!email || !mission) {
                console.warn('getCurrentRole called without required parameters');
                return res.status(400).json({ error: 'Email and mission parameters are required' });
            }

            const user = await User.findOne(
                { 'auth.email': email },
                { 'missions': 1 }
            ).lean();

            if (!user || !user.missions || user.missions.length === 0) {
                console.warn(`User ${email} not found or has no missions`);
                return res.status(404).send([]);
            }

            const userMission = user.missions.find(m => m.name && m.name.toLowerCase() === mission);
            if (!userMission) {
                console.warn(`User ${email} doesn't have mission: ${mission}`);
                return res.status(404).send([]);
            }

            return res.status(200).send(userMission.currentRole);

        } catch (error) {
            console.error('Error in getCurrentRole:', error);
            return res.status(500).json({
                error: 'Internal server error',
                message: error.message
            });
        }
    },
    getAllowedRoles: async function (req, res) {
        try {
            const { email } = req.query;
            const mission = (req.query.mission || '').toLowerCase();

            if (!email || !mission) {
                console.warn('getAllowedRoles called without required parameters');
                return res.status(400).json({ error: 'Email and mission parameters are required' });
            }

            const user = await User.findOne(
                { 'auth.email': email },
                { 'missions': 1 }
            ).lean();

            if (!user || !user.missions || user.missions.length === 0) {
                console.warn(`User ${email} not found or has no missions`);
                return res.status(404).send([]);
            }

            const userMission = user.missions.find(m => m.name && m.name.toLowerCase() === mission);
            if (!userMission) {
                console.warn(`User ${email} doesn't have mission: ${mission}`);
                return res.status(404).send([]);
            }

            return res.status(200).json(userMission.allowedRoles);

        } catch (error) {
            console.error('Error in getAllowedRoles:', error);
            return res.status(500).json({
                error: 'Internal server error',
                message: error.message
            });
        }
    },
    getUsers: async function (req, res) {
        try {
            const mission = (req.query.mission || '').toLowerCase();

            if (!mission) {
                console.warn('getUsers called without mission parameter');
                return res.status(400).json({ error: 'Mission parameter is required' });
            }

            // Query all users with missions, then filter case-insensitively
            const users = await User.find(
                { 'missions': { $exists: true, $not: { $size: 0 } } },
                { 'auth': 1, 'missions': 1 }
            ).lean();

            console.log(`Found ${users ? users.length : 0} total users, filtering for mission: ${mission}`);

            if (!users || users.length === 0) {
                console.log(`No users found for mission: ${mission}`);
                return res.status(404).send([]);
            }

            const allUsers = users.map(user => {
                if (!user.missions || user.missions.length === 0) {
                    console.warn(`User ${user.auth?.email} has no missions data`);
                    return null;
                }

                const userMission = user.missions.find(m => m.name && m.name.toLowerCase() === mission);
                if (!userMission) {
                    console.warn(`User ${user.auth?.email} doesn't have mission: ${mission}`);
                    return null;
                }

                // Safety check for allowedRoles array
                const allowedRoles = userMission.allowedRoles || [];
                if (allowedRoles.length === 0) {
                    console.warn(`User ${user.auth?.email} has empty allowedRoles for mission: ${mission}`);
                }

                return {
                    auth: user.auth,
                    currentRole: userMission.currentRole,
                    allowedRoles: allowedRoles
                };
            }).filter(Boolean);

            console.log(`Successfully processed ${allUsers.length} users for mission: ${mission}`);
            return res.status(200).send(allUsers);

        } catch (error) {
            console.error('Error in getUsers:', error);
            console.error('Error stack:', error.stack);
            console.error('Query mission:', req.query.mission);
            return res.status(500).json({
                error: 'Internal server error',
                message: error.message,
                details: process.env.NODE_ENV === 'development' ? error.stack : undefined
            });
        }
    },
    getRoles: function (req, res) {
        res.send(configRole);
    },
    getMissions: async function (req, res) {
        try {
            const users = await User.find(
                { 'missions': { $exists: true, $not: { $size: 0 } } },
                { 'missions.name': 1 }
            ).lean();

            const missionSet = new Set();
            if (users) {
                users.forEach(u => {
                    if (u.missions) {
                        u.missions.forEach(m => {
                            if (m.name) missionSet.add(m.name);
                        });
                    }
                });
            }

            return res.status(200).json(Array.from(missionSet).sort());
        } catch (error) {
            console.error('Error in getMissions:', error);
            return res.status(500).json({ error: 'Internal server error' });
        }
    },
    getUserMissions: async function (req, res) {
        try {
            const email = req.query.email;
            if (!email) {
                return res.status(400).json({ error: 'Email parameter is required' });
            }

            const user = await User.findOne(
                { 'auth.email': email },
                { 'missions.name': 1 }
            ).lean();

            if (!user || !user.missions) {
                return res.status(200).json([]);
            }

            const names = user.missions.filter(m => m.name).map(m => m.name);
            return res.status(200).json(names);
        } catch (error) {
            console.error('Error in getUserMissions:', error);
            return res.status(500).json({ error: 'Internal server error' });
        }
    },
    removeMissionFromUser: async function (req, res) {
        try {
            const { email, mission } = req.body;
            if (!email || !mission) {
                return res.status(400).json({ error: 'Email and mission are required' });
            }

            const missionLower = mission.toLowerCase();
            const user = await User.findOne({ 'auth.email': email });

            if (!user) {
                return res.status(404).json({ error: 'User not found' });
            }

            if (!user.missions || user.missions.length === 0) {
                return res.status(400).json({ error: 'User has no missions' });
            }

            const idx = user.missions.findIndex(m => m.name && m.name.toLowerCase() === missionLower);
            if (idx === -1) {
                return res.status(404).json({ error: 'User does not belong to this mission' });
            }

            user.missions.splice(idx, 1);
            user.markModified('missions');

            const result = await user.save();
            return res.status(200).json({ missions: result.missions.filter(m => m.name).map(m => m.name) });
        } catch (error) {
            console.error('Error in removeMissionFromUser:', error);
            return res.status(500).json({ error: 'Internal server error' });
        }
    },
    setMissionForUser: function (req, res) {
        var email = req.body.email;
        var mission = (req.body.mission || '').toLowerCase();
        var defaultRole = {
            'name': configRole.roles['VIP'].name,
            'callsign': configRole.roles['VIP'].callsign
        };
        var missionCount = 0;
        var missionObj;

        //count the number of users for this mission
        User.countDocuments({ 'missions.name': { $regex: new RegExp('^' + mission.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$', 'i') } }, function (err, count) {
            if (err) {
                console.log(err);
            }

            User.findOne({ 'auth.email': email }, function (err, user) {
                if (err) {
                    console.log(err);
                }

                if (user) {
                    //If zero users for this mission, then assign user as Mission Director
                    if (count === 0) {
                        var userRole = {
                            'name': configRole.roles['MD'].name,
                            'callsign': configRole.roles['MD'].callsign
                        };
                        missionObj = {
                            'name': mission,
                            'currentRole': userRole,
                            'allowedRoles': []
                        };
                        missionObj.allowedRoles.push(defaultRole);
                        missionObj.allowedRoles.push(userRole);

                        user.missions.push(missionObj);
                    } else {
                        //check if the mission exists in the user's mission list
                        for (var i = 0; i < user.missions.length; i++) {
                            if (user.missions[i].name && user.missions[i].name.toLowerCase() === mission) {
                                if (!containsObject(user.missions[i].currentRole, user.missions[i].allowedRoles)) {
                                    //update current role to default role if current role is not a part of allowed roles
                                    user.missions[i].currentRole = defaultRole;
                                }
                                missionObj = user.missions[i];
                                missionCount++;
                            }
                        }

                        //If mission does not exist for this user, assign Observer role
                        if (missionCount == 0) {
                            missionObj = {
                                'name': mission,
                                'currentRole': defaultRole,
                                'allowedRoles': []
                            };
                            missionObj.allowedRoles.push(defaultRole);

                            user.missions.push(missionObj);
                        }
                    }

                    user.markModified('missions');

                    user.save(function (err, result) {
                        if (err) {
                            console.log(err);
                        }

                        if (result) {
                            res.send(missionObj);
                        }

                    });
                }

            });
        });
    },
    setUserRole: async function (req, res) {
        try {
            const { email, role } = req.body;
            const mission = (req.body.mission || '').toLowerCase();

            if (!email || !role || !mission) {
                return res.status(400).send([]);
            }

            // Users can only change their own role
            if (req.user.auth.email !== email) {
                return res.status(403).json({ error: 'Forbidden', message: 'You can only change your own role' });
            }

            const user = await User.findOne(
                { 'auth.email': email, 'missions.name': mission }
            );

            if (!user) {
                return res.status(404).send([]);
            }

            const missionIndex = user.missions.findIndex(m => m.name && m.name.toLowerCase() === mission);
            if (missionIndex === -1) {
                return res.status(400).send([]);
            }

            // Verify the requested role is in the user's allowedRoles for this mission
            const allowed = user.missions[missionIndex].allowedRoles || [];
            const isAllowed = allowed.some(function (r) {
                return r.callsign === role.callsign;
            });
            if (!isAllowed) {
                return res.status(403).json({ error: 'Forbidden', message: 'Role not in your allowed roles' });
            }

            user.missions[missionIndex].currentRole = role;
            user.markModified('missions');

            const result = await user.save();
            return res.status(200).send(result);

        } catch (error) {
            console.error('Error in setUserRole:', error);
            return res.status(500).send([]);
        }
    },
    setAllowedRoles: async function (req, res) {
        try {
            const { email, roles } = req.body;
            const mission = (req.body.mission || '').toLowerCase();

            if (!email || !roles || !mission) {
                return res.status(400).send([]);
            }

            const user = await User.findOne(
                { 'auth.email': email, 'missions.name': mission }
            );

            if (!user) {
                return res.status(404).send([]);
            }

            const missionIndex = user.missions.findIndex(m => m.name && m.name.toLowerCase() === mission);
            if (missionIndex === -1) {
                return res.status(404).send([]);
            }

            user.missions[missionIndex].allowedRoles = roles;
            user.markModified('missions');

            const result = await user.save();
            return res.status(200).send(result);

        } catch (error) {
            console.error('Error in setAllowedRoles:', error);
            return res.status(500).send([]);
        }
    },
    getUsersCurrentRole: async function (req, res) {
        try {
            const mission = (req.query.mission || '').toLowerCase();

            if (!mission) {
                console.warn('getUsersCurrentRole called without mission parameter');
                return res.status(400).json({ error: 'Mission parameter is required' });
            }

            console.log(`Fetching users current roles for mission: ${mission}`);

            const users = await User.find(
                { 'missions.name': mission },
                { 'auth': 1, 'missions': 1 }
            ).lean();

            if (!users || users.length === 0) {
                console.log(`No users found for mission: ${mission}`);
                return res.status(404).send([]);
            }

            // Process users to extract only the relevant mission data
            const processedUsers = users.map(user => {
                if (!user.missions || user.missions.length === 0) {
                    console.warn(`User ${user.auth?.email} has no missions data`);
                    return null;
                }

                // Find the specific mission
                const userMission = user.missions.find(m => m.name && m.name.toLowerCase() === mission);
                if (!userMission) {
                    console.warn(`User ${user.auth?.email} doesn't have mission: ${mission}`);
                    return null;
                }

                return {
                    auth: user.auth,
                    missions: [userMission] // Return only the relevant mission
                };
            }).filter(Boolean);

            console.log(`Successfully processed ${processedUsers.length} users for mission: ${mission}`);
            return res.status(200).send(processedUsers);

        } catch (error) {
            console.error('Error in getUsersCurrentRole:', error);
            return res.status(500).json({
                error: 'Internal server error',
                message: error.message
            });
        }
    }
};

//Check if an array list contains an object
function containsObject(obj, list) {
    var i;
    for (i = 0; i < list.length; i++) {
        if (isEquivalent(list[i], obj)) {
            return true;
        }
    }

    return false;
}

//Equality of Objects
function isEquivalent(a, b) {
    // Create arrays of property names
    var propA = Object.getOwnPropertyNames(a);
    var propB = Object.getOwnPropertyNames(b);

    // If number of properties are different
    if (propA.length != propB.length) {
        return false;
    }

    for (var i = 0; i < propA.length; i++) {
        var property = propA[i];

        // check values of same property
        if (a[property] !== b[property]) {
            return false;
        }
    }

    return true;
}
