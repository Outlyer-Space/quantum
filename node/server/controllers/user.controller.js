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
                return res.status(400).send([]);
            }

            const user = await User.findOne(
                { 'auth.email': email, 'missions.name': mission },
                { 'missions.$': 1 }
            );

            if (!user || !user.missions || !user.missions[0]) {
                return res.status(404).send([]);
            }

            return res.status(200).send(user.missions[0].currentRole);

        } catch (error) {
            console.error('Error in getCurrentRole:', error);
            return res.status(500).send([]);
        }
    },
    getAllowedRoles: async function(req, res) {
        try {
            const { email, mission } = req.query;
            
            if (!email || !mission) {
                return res.status(400).send([]);
            }

            const user = await User.findOne(
                { 'auth.email': email, 'missions.name': mission },
                { 'missions.$': 1 }
            );

            if (!user || !user.missions || !user.missions[0]) {
                return res.status(404).send([]);
            }

            return res.status(200).json(user.missions[0].allowedRoles);

        } catch (error) {
            console.error('Error in getAllowedRoles:', error);
            return res.status(500).send([]);
        }
    },
    getUsers: async function(req, res) {
        try {
            const { mission } = req.query;
            
            if (!mission) {
                return res.status(400).send([]);
            }

            const users = await User.find(
                { 'missions.name': mission },
                { 'auth': 1, 'missions.$': 1 }
            ).lean();
            
            console.log(`Found ${users ? users.length : 0} users for mission: ${mission}`);
            
            // Debug: Log what we're actually getting from the database
            if (users && users.length > 0) {
                console.log('Raw database response for first user:');
                console.log(JSON.stringify(users[0], null, 2));
                
                if (users[0].missions && users[0].missions[0]) {
                    console.log('First user mission data:');
                    console.log('- Mission name:', users[0].missions[0].name);
                    console.log('- Current role:', JSON.stringify(users[0].missions[0].currentRole));
                    console.log('- Allowed roles:', JSON.stringify(users[0].missions[0].allowedRoles));
                    console.log('- Allowed roles length:', users[0].missions[0].allowedRoles ? users[0].missions[0].allowedRoles.length : 'undefined');
                }
            }

            // Alternative query approach - fetch all missions and filter in code
            console.log('Trying alternative query approach...');
            const usersAlt = await User.find(
                { 'missions.name': mission },
                { 'auth': 1, 'missions': 1 }
            ).lean();
            
            console.log(`Alternative query found ${usersAlt ? usersAlt.length : 0} users`);
            
            if (usersAlt && usersAlt.length > 0) {
                console.log('Alternative query - First user all missions:');
                const firstUserMissions = usersAlt[0].missions || [];
                firstUserMissions.forEach((m, idx) => {
                    console.log(`Mission ${idx}:`, {
                        name: m.name,
                        currentRole: m.currentRole,
                        allowedRoles: m.allowedRoles,
                        allowedRolesLength: m.allowedRoles ? m.allowedRoles.length : 'undefined'
                    });
                });
                
                // Find the specific mission
                const targetMission = firstUserMissions.find(m => m.name === mission);
                if (targetMission) {
                    console.log('Target mission found:', {
                        name: targetMission.name,
                        currentRole: targetMission.currentRole,
                        allowedRoles: targetMission.allowedRoles
                    });
                }
            }

            if (!users || users.length === 0) {
                console.log(`No users found for mission: ${mission}`);
                return res.status(404).send([]);
            }

            const allUsers = users.map(user => {
                if (!user.missions || !user.missions[0]) {
                    console.log(`User ${user.auth?.email} has no missions data in positional query result`);
                    return null;
                }

                // Safety check for allowedRoles array
                const allowedRoles = user.missions[0].allowedRoles || [];
                console.log(`User ${user.auth?.email} - Positional query allowedRoles:`, allowedRoles);
                
                const aRoles = allowedRoles.reduce((acc, role) => {
                    // Safety check for role structure
                    if (role && role.callsign) {
                        acc[role.callsign] = 1;
                    }
                    return acc;
                }, {});

                return {
                    auth: user.auth,
                    currentRole: user.missions[0].currentRole,
                    allowedRoles: aRoles
                };
            }).filter(Boolean);
            
            // Alternative approach using the full missions array
            console.log('Processing with alternative approach...');
            const allUsersAlt = usersAlt.map(user => {
                if (!user.missions || user.missions.length === 0) {
                    console.log(`User ${user.auth?.email} has no missions data`);
                    return null;
                }

                // Find the specific mission instead of relying on positional operator
                const userMission = user.missions.find(m => m.name === mission);
                if (!userMission) {
                    console.log(`User ${user.auth?.email} doesn't have mission: ${mission}`);
                    return null;
                }

                console.log(`User ${user.auth?.email} - Alternative query mission:`, {
                    name: userMission.name,
                    currentRole: userMission.currentRole,
                    allowedRoles: userMission.allowedRoles
                });

                // Safety check for allowedRoles array
                const allowedRoles = userMission.allowedRoles || [];
                const aRoles = allowedRoles.reduce((acc, role) => {
                    // Safety check for role structure
                    if (role && role.callsign) {
                        acc[role.callsign] = 1;
                    }
                    return acc;
                }, {});

                return {
                    auth: user.auth,
                    currentRole: userMission.currentRole,
                    allowedRoles: aRoles
                };
            }).filter(Boolean);
            
            console.log('Comparison - Positional query results:', allUsers.length);
            console.log('Comparison - Alternative query results:', allUsersAlt.length);
            
            // Use the alternative approach as it's more reliable
            const finalUsers = allUsersAlt.length > 0 ? allUsersAlt : allUsers;

            return res.status(200).send(finalUsers);

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
                return res.status(400).send([]);
            }

            const users = await User.find(
                { 'missions.name': mission },
                { 'auth': 1, 'missions.$': 1 }
            );

            if (!users || users.length === 0) {
                return res.status(404).send([]);
            }

            return res.status(200).send(users);

        } catch (error) {
            console.error('Error in getUsersCurrentRole:', error);
                return res.status(500).send([]);
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
