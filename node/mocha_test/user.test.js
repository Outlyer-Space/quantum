var chai = require("chai");
var spies = require('chai-spies');
chai.use(spies);
var sinon = require('sinon');
var mongoose = require('mongoose');
mongoose.Promise = global.Promise;
var expect = chai.expect;
var assert = chai.assert;
var mockConfig = { auth: { provider: 'mongo' }, node: { environ: 'test' } };
var Usr = require('../server/models/user')(mockConfig, mongoose);
var configRole = require('../config/role');

describe('Test Suite for User Model ', function () {
    it('should be invalid if the model is empty', function (done) {
        var m = new Usr();
        m.validate(function (err) {
            // Model should fail validation when empty
            expect(err).to.exist;
            expect(err.errors).to.exist;
            done();
        });
    });

    it('should validate if all of the properties are defined with valid data types', function (done) {
        var m = new Usr({
            auth: {
                id: '102010',
                token: 'fhdhgretvsg',
                email: 'tgattu@gmail.com',
                name: 'Taruni Gattu'

            },
            grid: [{}, {}],
            missions: [{}, {}]
        });
        m.validate(function (err) {
            assert.isNull(err);
            done();
        });
    });

    it('should invalidate if auth id is not a string type', function (done) {
        var m = new Usr({
            auth: {
                id: {},
                token: 'fhdhgretvsg',
                email: 'tgattu@gmail.com',
                name: 'Taruni Gattu'

            },
            grid: [{}, {}],
            missions: [{}, {}]
        });
        m.validate(function (err) {
            expect(err.errors['auth.id'].name).to.exist;
            expect(err.errors['auth.id'].name).to.equal('CastError');
            done();
        });
    });


    it('should invalidate if auth token is not a string type', function (done) {
        var m = new Usr({
            auth: {
                id: '102010',
                token: {},
                email: 'tgattu@gmail.com',
                name: 'Taruni Gattu'

            },
            grid: [{}, {}],
            missions: [{}, {}]
        });
        m.validate(function (err) {
            expect(err.errors['auth.token'].name).to.exist;
            expect(err.errors['auth.token'].name).to.equal('CastError');
            done();
        });
    });

    it('should invalidate if auth email is not a string type', function (done) {
        var m = new Usr({
            auth: {
                id: '102010',
                token: 'fhdhgretvsg',
                email: {},
                name: 'Taruni Gattu'

            },
            grid: [{}, {}],
            missions: [{}, {}]
        });
        m.validate(function (err) {
            expect(err.errors['auth.email'].name).to.exist;
            expect(err.errors['auth.email'].name).to.equal('CastError');
            done();
        });
    });

    it('should invalidate if auth name is not a string type', function (done) {
        var m = new Usr({
            auth: {
                id: '102010',
                token: 'fhdhgretvsg',
                email: 'tgattu@gmail.com',
                name: {}

            },
            grid: [{}, {}],
            missions: [{}, {}]
        });
        m.validate(function (err) {
            expect(err.errors['auth.name'].name).to.exist;
            expect(err.errors['auth.name'].name).to.equal('CastError');
            done();
        });
    });

    it('should invalidate if grid is not defined as its not mandatory', function (done) {
        var m = new Usr({
            auth: {
                id: '102010',
                token: 'fhdhgretvsg',
                email: 'tgattu@gmail.com',
                name: 'Taruni Gattu'

            },
            missions: [{}, {}]
        });
        m.validate(function (err) {
            assert.isNull(err);
            done();
        });
    });

    it('should validate if missions is not defined as its not mandatory', function (done) {
        var m = new Usr({
            auth: {
                id: '102010',
                token: 'fhdhgretvsg',
                email: 'tgattu@gmail.com',
                name: 'Taruni Gattu'

            },
            grid: [{}, {}]
        });
        m.validate(function (err) {
            assert.isNull(err);
            done();
        });
    });

});

describe('Test Suite for User Model Route Controller', function () {
    let findOneStub, findStub, countStub, saveStub;

    beforeEach(function () {
        // Create stubs that return objects with .lean() method for chaining
        findOneStub = sinon.stub(Usr, 'findOne');
        findStub = sinon.stub(Usr, 'find');
        countStub = sinon.stub(Usr, 'count');
        saveStub = sinon.stub(Usr.prototype, 'save');
    });

    afterEach(function () {
        findOneStub.restore();
        findStub.restore();
        countStub.restore();
        saveStub.restore();
    });

    // Helper to create a chainable query mock with .lean()
    function createQueryMock(resolveValue) {
        return {
            lean: sinon.stub().resolves(resolveValue)
        };
    }

    it('should get current role of the user', async function () {
        const userCtrl = require('../server/controllers/user.controller');
        var user = {
            auth: {},
            missions: [
                {
                    name: "AZero",
                    currentRole: 'MD',
                    allowedRoles: [
                        { callsign: 'SYS' },
                        { callsign: 'CC' }
                    ]
                }]
        };
        findOneStub.returns(createQueryMock(user));

        var req = {
            query: {
                mission: 'AZero',
                email: 'tgattu@gmail.com'
            }
        };
        var res = {
            status: sinon.stub().returnsThis(),
            send: sinon.spy(),
            json: sinon.spy()
        };

        await userCtrl.getCurrentRole(req, res);
        sinon.assert.calledWith(findOneStub, { 'auth.email': 'tgattu@gmail.com', 'missions.name': 'AZero' }, { 'missions': 1 });
        expect(res.status.calledWith(200)).to.be.true;
        expect(res.send.calledOnce).to.be.true;
        sinon.assert.calledWith(res.send, 'MD');
    });

    it('should not get current role of the user when error', async function () {
        const userCtrl = require('../server/controllers/user.controller');
        findOneStub.returns({
            lean: sinon.stub().rejects(new Error('MongoError'))
        });

        var req = {
            query: {
                mission: 'AZero',
                email: 'tgattu@gmail.com'
            }
        };
        var res = {
            status: sinon.stub().returnsThis(),
            send: sinon.spy(),
            json: sinon.spy()
        };

        await userCtrl.getCurrentRole(req, res);
        expect(res.status.calledWith(500)).to.be.true;
    });

    it('should get allowed roles of the user', async function () {
        const userCtrl = require('../server/controllers/user.controller');
        var user = {
            auth: {},
            missions: [
                {
                    name: "AZero",
                    currentRole: 'MD',
                    allowedRoles: [
                        { callsign: 'SYS' },
                        { callsign: 'CC' }
                    ]
                }]
        };
        findOneStub.returns(createQueryMock(user));

        var req = {
            query: {
                mission: 'AZero',
                email: 'tgattu@gmail.com'
            }
        };
        var res = {
            status: sinon.stub().returnsThis(),
            send: sinon.spy(),
            json: sinon.spy()
        };

        await userCtrl.getAllowedRoles(req, res);
        sinon.assert.calledWith(findOneStub, { 'auth.email': 'tgattu@gmail.com', 'missions.name': 'AZero' }, { 'missions': 1 });
        expect(res.status.calledWith(200)).to.be.true;
        sinon.assert.calledWith(res.json, [{ callsign: 'SYS' }, { callsign: 'CC' }]);
    });

    it('should not get allowed roles of the user when error', async function () {
        const userCtrl = require('../server/controllers/user.controller');
        findOneStub.returns({
            lean: sinon.stub().rejects(new Error('MongoError'))
        });

        var req = {
            query: {
                mission: 'AZero',
                email: 'tgattu@gmail.com'
            }
        };
        var res = {
            status: sinon.stub().returnsThis(),
            send: sinon.spy(),
            json: sinon.spy()
        };

        await userCtrl.getAllowedRoles(req, res);
        expect(res.status.calledWith(500)).to.be.true;
    });

    it('should get all users', async function () {
        const userCtrl = require('../server/controllers/user.controller');
        var users = [
            {
                auth: {},
                missions: [
                    {
                        name: "AZero",
                        currentRole: 'MD',
                        allowedRoles: [
                            { callsign: 'SYS' },
                            { callsign: 'CC' }
                        ]
                    }
                ]
            }

        ];
        findStub.returns(createQueryMock(users));

        var req = {
            query: {
                mission: 'AZero'
            }
        };
        var res = {
            status: sinon.stub().returnsThis(),
            send: sinon.spy(),
            json: sinon.spy()
        };

        await userCtrl.getUsers(req, res);
        sinon.assert.calledWith(findStub, { 'missions.name': 'AZero' }, { 'auth': 1, 'missions': 1 });
        expect(res.status.calledWith(200)).to.be.true;
        expect(res.send.calledOnce).to.be.true;
        sinon.assert.calledWith(res.send, [{ allowedRoles: { CC: 1, SYS: 1 }, currentRole: "MD", auth: {} }]);
    });

    it('should not get all users when error', async function () {
        const userCtrl = require('../server/controllers/user.controller');
        findStub.returns({
            lean: sinon.stub().rejects(new Error('MongoError'))
        });

        var req = {
            query: {
                mission: 'AZero'
            }
        };
        var res = {
            status: sinon.stub().returnsThis(),
            send: sinon.spy(),
            json: sinon.spy()
        };

        await userCtrl.getUsers(req, res);
        expect(res.status.calledWith(500)).to.be.true;
    });

    it('should get all roles', function () {
        const userCtrl = require('../server/controllers/user.controller');
        var req = {};
        var res = {
            send: sinon.spy()
        };
        var output = require('../config/role');

        userCtrl.getRoles(req, res);
        expect(res.send.calledOnce).to.be.true;
        sinon.assert.calledWith(res.send, output);
    });

    it("should post role for user", async function () {
        const userCtrl = require('../server/controllers/user.controller');
        var user = {
            auth: {},
            missions: [
                {
                    name: "AZero",
                    currentRole: 'MD',
                    allowedRoles: [
                        { callsign: 'SYS' },
                        { callsign: 'CC' }
                    ]
                }
            ],
            markModified: sinon.stub(),
            save: sinon.stub().resolves({
                auth: {},
                missions: [
                    {
                        name: "AZero",
                        currentRole: 'SYS',
                        allowedRoles: [
                            { callsign: 'SYS' },
                            { callsign: 'IT' },
                            { callsign: 'PROXY' }
                        ]
                    }
                ]
            })
        };
        findOneStub.resolves(user);

        var req = {
            body: {
                mission: 'AZero',
                email: 'tgattu@gmail.com',
                role: 'SYS'
            }
        };
        var res = {
            status: sinon.stub().returnsThis(),
            send: sinon.spy()
        };

        await userCtrl.setUserRole(req, res);
        sinon.assert.calledWith(findOneStub, { 'auth.email': 'tgattu@gmail.com', 'missions.name': 'AZero' });
        expect(res.status.calledWith(200)).to.be.true;
        expect(res.send.calledOnce).to.be.true;
    });

    it("should not post role for user when error", async function () {
        const userCtrl = require('../server/controllers/user.controller');
        findOneStub.rejects(new Error('MongoError'));

        var req = {
            body: {
                mission: 'AZero',
                email: 'tgattu@gmail.com',
                role: 'SYS'
            }
        };
        var res = {
            status: sinon.stub().returnsThis(),
            send: sinon.spy()
        };

        await userCtrl.setUserRole(req, res);
        expect(res.status.calledWith(500)).to.be.true;
    });

    it("should post allowed roles for user", async function () {
        const userCtrl = require('../server/controllers/user.controller');
        var user = {
            auth: {},
            missions: [
                {
                    name: "AZero",
                    currentRole: 'MD',
                    allowedRoles: [
                        { callsign: 'SYS' },
                        { callsign: 'CC' }
                    ]
                }
            ],
            markModified: sinon.stub(),
            save: sinon.stub().resolves({
                auth: {},
                missions: [
                    {
                        name: "AZero",
                        currentRole: 'SYS',
                        allowedRoles: [
                            { callsign: 'SYS' },
                            { callsign: 'IT' },
                            { callsign: 'PROXY' }
                        ]
                    }
                ]
            })
        };
        findOneStub.resolves(user);

        var req = {
            body: {
                mission: 'AZero',
                email: 'tgattu@gmail.com',
                roles: [
                    { callsign: 'SYS' },
                    { callsign: 'IT' },
                    { callsign: 'PROXY' }
                ]
            }
        };
        var res = {
            status: sinon.stub().returnsThis(),
            send: sinon.spy()
        };

        await userCtrl.setAllowedRoles(req, res);
        sinon.assert.calledWith(findOneStub, { 'auth.email': 'tgattu@gmail.com', 'missions.name': 'AZero' });
        expect(res.status.calledWith(200)).to.be.true;
        expect(res.send.calledOnce).to.be.true;
    });

    it("should not post allowed roles for user when error", async function () {
        const userCtrl = require('../server/controllers/user.controller');
        findOneStub.rejects(new Error('MongoError'));

        var req = {
            body: {
                mission: 'AZero',
                email: 'tgattu@gmail.com',
                roles: [
                    { callsign: 'SYS' },
                    { callsign: 'IT' },
                    { callsign: 'PROXY' }
                ]
            }
        };
        var res = {
            status: sinon.stub().returnsThis(),
            send: sinon.spy()
        };

        await userCtrl.setAllowedRoles(req, res);
        expect(res.status.calledWith(500)).to.be.true;
    });

    it("should set first user as 'MD' and post mission for user when no users are available for that mission", function (done) {
        const userCtrl = require('../server/controllers/user.controller');
        var count = 0;
        var user = {
            auth: {},
            missions: [],
            markModified: function (message) { },
            save: function (cb) {
                var err = null;
                var result = { missions: [{ name: 'AZero' }] };
                cb(err, result);
            }
        };
        countStub.yields(null, count);
        findOneStub.yields(null, user);

        var req = {
            body: {
                mission: 'AZero',
                email: 'tgattu@gmail.com'
            }
        };
        var res = {
            send: function (output) {
                expect(output.name).to.equal('AZero');
                expect(output.currentRole.callsign).to.equal('MD');
                done();
            }
        };

        userCtrl.setMissionForUser(req, res);
    });

    it("should not set first user as 'MD' and post mission for user when no users are available for that mission but database error", function () {
        const userCtrl = require('../server/controllers/user.controller');
        countStub.yields({ name: "MongoError" }, null);
        findOneStub.yields({ name: "MongoError" }, null);

        var req = {
            body: {
                mission: 'AZero',
                email: 'tgattu@gmail.com'
            }
        };
        var res = {
            send: sinon.spy()
        };

        userCtrl.setMissionForUser(req, res);
        sinon.assert.calledWith(countStub, { 'missions.name': 'AZero' }, sinon.match.func);
        expect(res.send.calledOnce).to.be.false;
    });

    it("should set mission for user when no missions are available", function (done) {
        const userCtrl = require('../server/controllers/user.controller');
        var count = 2;
        var user = {
            auth: {},
            missions: [],
            markModified: function (message) { },
            save: function (cb) {
                var err = null;
                var result = { missions: [{ name: 'AZero' }] };
                cb(err, result);
            }
        };
        countStub.yields(null, count);
        findOneStub.yields(null, user);

        var req = {
            body: {
                mission: 'AZero',
                email: 'tgattu@gmail.com'
            }
        };
        var res = {
            send: function (output) {
                expect(output.name).to.equal('AZero');
                expect(output.currentRole.callsign).to.equal('VIP');
                done();
            }
        };

        userCtrl.setMissionForUser(req, res);
    });

    it("should not set mission for user when no missions are available but database error", function () {
        const userCtrl = require('../server/controllers/user.controller');
        var count = 2;
        var user = {
            auth: {},
            missions: [],
            markModified: function (message) { },
            save: function (cb) {
                var err = { name: 'MongoError' };
                var result = null;
                cb(err, result);
            }
        };
        countStub.yields(null, count);
        findOneStub.yields(null, user);

        var req = {
            body: {
                mission: 'AZero',
                email: 'tgattu@gmail.com'
            }
        };
        var res = {
            send: sinon.spy()
        };

        userCtrl.setMissionForUser(req, res);
        sinon.assert.calledWith(countStub, { 'missions.name': 'AZero' }, sinon.match.func);
        expect(res.send.calledOnce).to.be.false;
    });

    it("should set mission for user when missions are available", function (done) {
        const userCtrl = require('../server/controllers/user.controller');
        var count = 2;
        var user = {
            auth: {},
            missions: [
                {
                    name: "AZero",
                    currentRole: { name: 'Observer', callsign: 'VIP' },
                    allowedRoles: [
                        { callsign: 'SYS' },
                        { callsign: 'CC' }
                    ]
                }
            ],
            markModified: function (message) { },
            save: function (cb) {
                var err = null;
                var result = { missions: [{ name: 'AZero' }] };
                cb(err, result);
            }
        };
        countStub.yields(null, count);
        findOneStub.yields(null, user);

        var req = {
            body: {
                mission: 'AZero',
                email: 'tgattu@gmail.com'
            }
        };
        var res = {
            send: function (output) {
                expect(output.name).to.equal('AZero');
                done();
            }
        };

        userCtrl.setMissionForUser(req, res);
    });

    it("should not set mission for user when missions are available but database error", function () {
        const userCtrl = require('../server/controllers/user.controller');
        var count = 2;
        var user = {
            auth: {},
            missions: [
                {
                    name: "AZero",
                    currentRole: 'MD',
                    allowedRoles: [
                        { callsign: 'SYS' },
                        { callsign: 'CC' }
                    ]
                }
            ],
            markModified: function (message) { },
            save: function (cb) {
                var err = { name: "MongoError" };
                var result = null;
                cb(err, result);
            }
        };

        countStub.yields(null, count);
        findOneStub.yields(null, user);

        var req = {
            body: {
                mission: 'AZero',
                email: 'tgattu@gmail.com'
            }
        };
        var res = {
            send: sinon.spy()
        };

        userCtrl.setMissionForUser(req, res);
        sinon.assert.calledWith(countStub, { 'missions.name': 'AZero' }, sinon.match.func);
        expect(res.send.calledOnce).to.be.false;
    });
});
