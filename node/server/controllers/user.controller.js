var mongoose = require('mongoose');
var User = mongoose.model('User');
var multer = require('multer');
var XLSX = require("xlsx");
var configRole = require('../../config/role');

module.exports = {
    getCurrentRole: async function(req, res) {
        try {
            const { email, mission } = req.query;
            
            if (!email || !mission) {
                console.warn('getCurrentRole called without required parameters');
                return res.status(400).json({ error: 'Email and mission parameters are required' });
            }

            const user = await User.findOne(
                { 'auth.email': email, 'missions.name': mission },
                { 'missions': 1 }
            ).lean();

            if (!user || !user.missions || user.missions.length === 0) {
                console.warn(`User ${email} not found or has no missions`);
                return res.status(404).send([]);
            }

            const userMission = user.missions.find(m => m.name === mission);
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
    getAllowedRoles: async function(req, res) {
        try {
            const { email, mission } = req.query;
            
            if (!email || !mission) {
                console.warn('getAllowedRoles called without required parameters');
                return res.status(400).json({ error: 'Email and mission parameters are required' });
            }

            const user = await User.findOne(
                { 'auth.email': email, 'missions.name': mission },
                { 'missions': 1 }
            ).lean();

            if (!user || !user.missions || user.missions.length === 0) {
                console.warn(`User ${email} not found or has no missions`);
                return res.status(404).send([]);
            }

            const userMission = user.missions.find(m => m.name === mission);
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
    getUsers: async function(req, res) {
        try {
            const { mission } = req.query;
            
            if (!mission) {
                console.warn('getUsers called without mission parameter');
                return res.status(400).json({ error: 'Mission parameter is required' });
            }

            // Query users with the specified mission, fetching all missions to filter in code
            const users = await User.find(
                { 'missions.name': mission },
                { 'auth': 1, 'missions': 1 }
            ).lean();
            
            console.log(`Found ${users ? users.length : 0} users for mission: ${mission}`);

            if (!users || users.length === 0) {
                console.log(`No users found for mission: ${mission}`);
                return res.status(404).send([]);
            }

            const allUsers = users.map(user => {
                if (!user.missions || user.missions.length === 0) {
                    console.warn(`User ${user.auth?.email} has no missions data`);
                    return null;
                }
                
                const userMission = user.missions.find(m => m.name === mission);
                if (!userMission) {
                    console.warn(`User ${user.auth?.email} doesn't have mission: ${mission}`);
                    return null;
                }

                // Safety check for allowedRoles array
                const allowedRoles = userMission.allowedRoles || [];
                if (allowedRoles.length === 0) {
                    console.warn(`User ${user.auth?.email} has empty allowedRoles for mission: ${mission}`);
                }

                const aRoles = allowedRoles.reduce((acc, role) => {
                    // Safety check for role structure
                    if (role && role.callsign) {
                        acc[role.callsign] = 1;
                    } else {
                        console.warn(`Invalid role structure for user ${user.auth?.email}:`, role);
                    }
                    return acc;
                }, {});

                return {
                    auth: user.auth,
                    currentRole: userMission.currentRole,
                    allowedRoles: aRoles
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
    getRoles: function(req,res){
        res.send(configRole);
    },
    setMissionForUser: function(req,res){
        var email = req.body.email;
        var mission = req.body.mission;
        var defaultRole = {
            'name'     : configRole.roles['VIP'].name,
            'callsign' : configRole.roles['VIP'].callsign
        };
        var missionCount = 0;
        var missionObj;

        //count the number of users for this mission
        User.count({ 'missions.name' : mission }, function(err, count) {
            if(err){
                console.log(err);
            }

            User.findOne({ 'auth.email' : email }, function(err, user) {
                if(err){
                    console.log(err);
                }

                if(user){
                    //If zero users for this mission, then assign user as Mission Director
                    if(count === 0){
                        var userRole = {
                            'name'     : configRole.roles['MD'].name,
                            'callsign' : configRole.roles['MD'].callsign
                        };
                        missionObj =  {
                            'name' : mission,
                            'currentRole' : userRole,
                            'allowedRoles' : []
                        };
                        missionObj.allowedRoles.push(defaultRole);
                        missionObj.allowedRoles.push(userRole);

                        user.missions.push(missionObj);
                    } else {
                        //check if the mission exists in the user's mission list
                        for(var i=0; i<user.missions.length; i++){
                            if(user.missions[i].name === mission){
                                if(!containsObject(user.missions[i].currentRole, user.missions[i].allowedRoles)){
                                    //update current role to default role if current role is not a part of allowed roles
                                    user.missions[i].currentRole = defaultRole;
                                }
                                missionObj = user.missions[i];
                                missionCount++;
                            }
                        }

                        //If mission does not exist for this user, assign Observer role
                        if(missionCount == 0) {
                            missionObj =  {
                                'name' : mission,
                                'currentRole' : defaultRole,
                                'allowedRoles' : []
                            };
                            missionObj.allowedRoles.push(defaultRole);

                            user.missions.push(missionObj);
                        }
                    }

                    user.markModified('missions');

                    user.save(function(err,result) {
                        if (err){
                            console.log(err);
                        }

                        if(result){
                            res.send(missionObj);
                        }

                    });
                }

            });
        });
    },
    setUserRole: async function(req, res) {
        try {
            const { email, role, mission } = req.body;
            
            if (!email || !role || !mission) {
                return res.status(400).send([]);
            }

            const user = await User.findOne(
                { 'auth.email': email, 'missions.name': mission }
            );

            if (!user) {
                return res.status(404).send([]);
            }

            const missionIndex = user.missions.findIndex(m => m.name === mission);
            if (missionIndex === -1) {
                return res.status(400).send([]);
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
    setAllowedRoles: async function(req, res) {
        try {
            const { email, roles, mission } = req.body;
            
            if (!email || !roles || !mission) {
                return res.status(400).send([]);
            }

            const user = await User.findOne(
                { 'auth.email': email, 'missions.name': mission }
            );

            if (!user) {
                return res.status(404).send([]);
            }

            const missionIndex = user.missions.findIndex(m => m.name === mission);
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
    getUsersCurrentRole: async function(req, res) {
        try {
            const { mission } = req.query;
            
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
                const userMission = user.missions.find(m => m.name === mission);
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
