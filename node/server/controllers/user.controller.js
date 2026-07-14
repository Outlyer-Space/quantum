var mongoose = require('mongoose');
var User = mongoose.model('User');
var multer = require('multer');

var configRole = require('../../config/role');

/** Strips sensitive auth fields before sending user data to the client */
function safeAuth(auth) {
    if (!auth) return {};
    return { id: auth.id, email: auth.email, name: auth.name };
}

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
                    return null;
                }

                const userMission = user.missions.find(m => m.name && m.name.toLowerCase() === mission);
                if (!userMission) {
                    return null;
                }

                const allowedRoles = userMission.allowedRoles || [];

                return {
                    // Security: strip auth.token and auth.salt — never send credentials to clients
                    auth: safeAuth(user.auth),
                    currentRole: userMission.currentRole,
                    allowedRoles: allowedRoles
                };
            }).filter(Boolean);

            console.log(`Successfully processed ${allUsers.length} users for mission: ${mission}`);
            return res.status(200).send(allUsers);

        } catch (error) {
            console.error('Error in getUsers:', error);
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

            const escapedMission = mission.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const result = await User.findOneAndUpdate(
                { 'auth.email': email },
                { $pull: { missions: { name: { $regex: `^${escapedMission}$`, $options: 'i' } } } },
                { new: true }
            );

            if (!result) {
                return res.status(404).json({ error: 'User not found' });
            }

            return res.status(200).json({ missions: result.missions.filter(m => m.name).map(m => m.name) });
        } catch (error) {
            console.error('Error in removeMissionFromUser:', error);
            return res.status(500).json({ error: 'Internal server error' });
        }
    },
    setMissionForUser: async function (req, res) {
        try {
            var email = req.body.email;
            var inputMission = (req.body.mission || '').trim();
            if (!inputMission) {
                return res.status(400).json({ error: 'Mission parameter is required' });
            }
            var missionLower = inputMission.toLowerCase();
            var defaultRole = {
                'name': configRole.roles['VIP'].name,
                'callsign': configRole.roles['VIP'].callsign
            };

            // Use string-based $regex (not new RegExp) to avoid ReDoS.
            // Special chars are escaped before interpolation.
            const escapedMission = inputMission.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

            // Check if this mission already exists to preserve its original casing
            const existingUser = await User.findOne({
                'missions.name': { $regex: `^${escapedMission}$`, $options: 'i' }
            }, { 'missions.name': 1 }).lean();

            var finalMissionName = inputMission;
            if (existingUser && existingUser.missions) {
                var found = existingUser.missions.find(m => m.name && m.name.toLowerCase() === missionLower);
                if (found) {
                    finalMissionName = found.name;
                }
            }

            // Count users already in this mission
            const count = await User.countDocuments({
                'missions.name': { $regex: `^${escapedMission}$`, $options: 'i' }
            });

            // Find the target user
            const user = await User.findOne({ 'auth.email': email });
            if (!user) {
                return res.status(404).json({ error: 'User not found' });
            }

            var missionCount = 0;
            var missionObj;

            if (count === 0) {
                // First user in this mission gets Mission Director role
                var userRole = {
                    'name': configRole.roles['MD'].name,
                    'callsign': configRole.roles['MD'].callsign
                };
                missionObj = {
                    'name': finalMissionName,
                    'currentRole': userRole,
                    'allowedRoles': [defaultRole, userRole]
                };
            } else {
                // Not the first user — check if they already have this mission
                const existing = user.missions.find(m => m.name && m.name.toLowerCase() === missionLower);
                if (existing) {
                    // Already assigned — ensure currentRole is valid
                    const currentRoleValid = existing.allowedRoles && existing.allowedRoles.some(r => r.callsign === existing.currentRole?.callsign);
                    missionObj = existing;
                    if (!currentRoleValid) {
                        // Fix the currentRole atomically
                        await User.updateOne(
                            { 'auth.email': email, 'missions.name': { $regex: `^${escapedMission}$`, $options: 'i' } },
                            { $set: { 'missions.$.currentRole': defaultRole } }
                        );
                        missionObj.currentRole = defaultRole;
                    }
                    return res.json(missionObj);
                } else {
                    missionObj = {
                        'name': finalMissionName,
                        'currentRole': defaultRole,
                        'allowedRoles': [defaultRole]
                    };
                }
            }

            // Atomically add the mission to the user's missions array
            await User.updateOne(
                { 'auth.email': email },
                { $push: { missions: missionObj } }
            );
            return res.json(missionObj);
        } catch (error) {
            console.error('Error in setMissionForUser:', error);
            return res.status(500).json({ error: 'Internal server error' });
        }
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

            const user = await User.findOne({ 'auth.email': email });

            if (!user) {
                return res.status(404).send([]);
            }

            const missionIndex = user.missions.findIndex(m => m.name && m.name.toLowerCase() === mission);
            if (missionIndex === -1) {
                return res.status(400).send([]);
            }

            // Atomically update only the currentRole of the specific mission
            const result = await User.findOneAndUpdate(
                { 'auth.email': email, [`missions.${missionIndex}.allowedRoles.callsign`]: role.callsign },
                { $set: { [`missions.${missionIndex}.currentRole`]: role } },
                { new: true }
            );

            if (!result) {
                return res.status(403).json({ error: 'Forbidden', message: 'Role not in your allowed roles' });
            }

            return res.status(200).json({ missions: result.missions });

        } catch (error) {
            console.error('Error in setUserRole:', error);
            return res.status(500).send([]);
        }
    },
    setAllowedRoles: async function (req, res) {
        try {
            const { email, roles } = req.body;
            const mission = (req.body.mission || '').toLowerCase();

            if (!email || !roles) {
                return res.status(400).send([]);
            }

            const user = await User.findOne({ 'auth.email': email });

            if (!user) {
                return res.status(404).send([]);
            }

            const missionIndex = mission
                ? user.missions.findIndex(m => m.name && m.name.toLowerCase() === mission)
                : -1;

            let result;
            if (missionIndex !== -1) {
                // Atomically set allowedRoles for the specific mission
                result = await User.findOneAndUpdate(
                    { 'auth.email': email },
                    { $set: { [`missions.${missionIndex}.allowedRoles`]: roles } },
                    { new: true }
                );
            } else {
                if (user.missions.length === 0) {
                    return res.status(404).send([]);
                }
                // Atomically set allowedRoles across all missions using arrayFilters
                result = await User.findOneAndUpdate(
                    { 'auth.email': email },
                    { $set: { 'missions.$[].allowedRoles': roles } },
                    { new: true }
                );
            }

            // Security: return only missions data, not the full document with auth credentials
            return res.status(200).json({ missions: result.missions });

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

            const processedUsers = users.map(user => {
                if (!user.missions || user.missions.length === 0) {
                    return null;
                }

                const userMission = user.missions.find(m => m.name && m.name.toLowerCase() === mission);
                if (!userMission) {
                    return null;
                }

                return {
                    // Security: strip auth.token and auth.salt
                    auth: safeAuth(user.auth),
                    missions: [userMission]
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
    var propA = Object.getOwnPropertyNames(a);
    var propB = Object.getOwnPropertyNames(b);

    if (propA.length != propB.length) {
        return false;
    }

    for (var i = 0; i < propA.length; i++) {
        var property = propA[i];
        if (a[property] !== b[property]) {
            return false;
        }
    }

    return true;
}
