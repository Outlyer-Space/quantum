const mongoose = require('mongoose');
const path = require('path');

// Fallback to localhost if not provided in env
const MONGO_DB_URL = process.env.MONGO_DB_URL || 'mongodb://localhost:27017/quantum';

mongoose.connect(MONGO_DB_URL, { useNewUrlParser: true, useUnifiedTopology: true })
    .then(async () => {
        console.log(`Connected to MongoDB at ${MONGO_DB_URL}`);
        
        const configRole = require('../node/config/role');
        const userModelSetup = require('../node/server/models/user');
        
        // Provide mock config for the User model initialization
        const config = {
            auth: {
                provider: 'mongo',
                clientID: 'sys.admin@localhost',
                clientSecret: '2infinity'
            }
        };

        const User = userModelSetup(config, mongoose);

        const usersToCreate = [
            {
                email: 'flight@nasa.gov',
                name: 'Flight Director',
                missions: [
                    { name: 'Artemis', currentRole: configRole.roles['FLIGHT'], allowedRoles: [configRole.roles['FLIGHT'], configRole.roles['VIP']] },
                    { name: 'Apollo', currentRole: configRole.roles['VIP'], allowedRoles: [configRole.roles['VIP']] }
                ],
                password: 'password'
            },
            {
                email: 'cc@nasa.gov',
                name: 'Capcom',
                missions: [
                    { name: 'Artemis', currentRole: configRole.roles['CC'], allowedRoles: [configRole.roles['CC'], configRole.roles['VIP']] },
                    { name: 'Quantum', currentRole: configRole.roles['VIP'], allowedRoles: [configRole.roles['VIP']] }
                ],
                password: 'password'
            },
            {
                email: 'tech@nasa.gov',
                name: 'Technician',
                missions: [
                    { name: 'Artemis', currentRole: configRole.roles['TECH'], allowedRoles: [configRole.roles['TECH']] },
                    { name: 'Quantum', currentRole: configRole.roles['VIP'], allowedRoles: [configRole.roles['VIP']] }
                ],
                password: 'password'
            }
        ];

        for (const u of usersToCreate) {
            try {
                // Check if user already exists
                const exists = await User.findOne({ 'auth.email': u.email });
                if (exists) {
                    console.log(`User ${u.email} already exists, skipping...`);
                    continue;
                }
                
                await new Promise((resolve, reject) => {
                    User.register({ auth: { email: u.email, name: u.name }, missions: u.missions }, u.password, (err, user) => {
                        if (err) return reject(err);
                        console.log(`Registered user: ${u.email} with missions: ${u.missions.map(m => m.name).join(', ')}`);
                        resolve(user);
                    });
                });
            } catch(e) {
                console.error(`Failed to register ${u.email}:`, e);
            }
        }

        mongoose.connection.close();
        console.log('Done seeding users.');
    })
    .catch(err => {
        console.error('MongoDB connection error:', err);
    });
