var chai = require("chai");
var sinon = require('sinon');
var expect = chai.expect;

var { ensureMissionAccess, ensureProcedureMissionAccess, getUserMissionNames, userHasLeadRole } = require('../server/lib/ensureMissionAccess');

// ============================================================================
// Unit tests for ensureMissionAccess helper functions
// ============================================================================

describe('Test Suite for Mission Access - Helper Functions', function () {

    describe('getUserMissionNames', function () {
        it('should return mission names from user object', function () {
            var user = {
                missions: [
                    { name: 'Alpha', currentRole: { callsign: 'CC' } },
                    { name: 'Bravo', currentRole: { callsign: 'SYS' } }
                ]
            };
            var names = getUserMissionNames(user);
            expect(names).to.deep.equal(['Alpha', 'Bravo']);
        });

        it('should return empty array if user has no missions', function () {
            expect(getUserMissionNames({ missions: [] })).to.deep.equal([]);
            expect(getUserMissionNames({})).to.deep.equal([]);
            expect(getUserMissionNames(null)).to.deep.equal([]);
        });

        it('should skip missions without a name', function () {
            var user = {
                missions: [
                    { name: 'Alpha' },
                    { currentRole: { callsign: 'CC' } },
                    { name: '' },
                    { name: 'Bravo' }
                ]
            };
            var names = getUserMissionNames(user);
            expect(names).to.deep.equal(['Alpha', 'Bravo']);
        });
    });

    describe('userHasLeadRole', function () {
        it('should return true when user has FLIGHT role', function () {
            var user = {
                missions: [{ name: 'Alpha', currentRole: { callsign: 'FLIGHT' } }]
            };
            expect(userHasLeadRole(user)).to.be.true;
        });

        it('should return true when user has MD role', function () {
            var user = {
                missions: [{ name: 'Alpha', currentRole: { callsign: 'MD' } }]
            };
            expect(userHasLeadRole(user)).to.be.true;
        });

        it('should return true when user has TD role', function () {
            var user = {
                missions: [{ name: 'Alpha', currentRole: { callsign: 'TD' } }]
            };
            expect(userHasLeadRole(user)).to.be.true;
        });

        it('should return false when user has only follow roles', function () {
            var user = {
                missions: [
                    { name: 'Alpha', currentRole: { callsign: 'CC' } },
                    { name: 'Bravo', currentRole: { callsign: 'SYS' } }
                ]
            };
            expect(userHasLeadRole(user)).to.be.false;
        });

        it('should return false for user with no missions', function () {
            expect(userHasLeadRole({ missions: [] })).to.be.false;
            expect(userHasLeadRole(null)).to.be.false;
        });

        it('should handle case-insensitive callsign checking', function () {
            var user = {
                missions: [{ name: 'Alpha', currentRole: { callsign: 'flight' } }]
            };
            expect(userHasLeadRole(user)).to.be.true;
        });
    });
});

// ============================================================================
// Unit tests for ensureMissionAccess middleware
// ============================================================================

describe('Test Suite for Mission Access - Middleware', function () {

    describe('ensureMissionAccess (list filtering)', function () {
        it('should return 401 if user is not authenticated', function () {
            var req = { isAuthenticated: function () { return false; } };
            var res = { status: sinon.stub().returnsThis(), json: sinon.stub() };
            var next = sinon.stub();

            ensureMissionAccess(req, res, next);

            expect(res.status.calledWith(401)).to.be.true;
            expect(next.called).to.be.false;
        });

        it('should set userMissionNames to null for lead-role users (no filtering)', function () {
            var req = {
                isAuthenticated: function () { return true; },
                user: {
                    missions: [{ name: 'Alpha', currentRole: { callsign: 'FLIGHT' } }]
                }
            };
            var res = { status: sinon.stub().returnsThis(), json: sinon.stub() };
            var next = sinon.stub();

            ensureMissionAccess(req, res, next);

            expect(req.userMissionNames).to.be.null;
            expect(next.calledOnce).to.be.true;
        });

        it('should set userMissionNames to user mission names for non-lead users', function () {
            var req = {
                isAuthenticated: function () { return true; },
                user: {
                    missions: [
                        { name: 'Alpha', currentRole: { callsign: 'CC' } },
                        { name: 'Bravo', currentRole: { callsign: 'SYS' } }
                    ]
                }
            };
            var res = { status: sinon.stub().returnsThis(), json: sinon.stub() };
            var next = sinon.stub();

            ensureMissionAccess(req, res, next);

            expect(req.userMissionNames).to.deep.equal(['Alpha', 'Bravo']);
            expect(next.calledOnce).to.be.true;
        });

        it('should return 403 if user has no missions', function () {
            var req = {
                isAuthenticated: function () { return true; },
                user: { missions: [] }
            };
            var res = { status: sinon.stub().returnsThis(), json: sinon.stub() };
            var next = sinon.stub();

            ensureMissionAccess(req, res, next);

            expect(res.status.calledWith(403)).to.be.true;
            expect(next.called).to.be.false;
        });
    });

    describe('getProcedureList with mission filtering', function () {
        var Procedure = require('../server/models/procedure');

        beforeEach(function () {
            sinon.stub(Procedure, 'find');
        });

        afterEach(function () {
            Procedure.find.restore();
        });

        it('should filter procedures by user mission names', function () {
            var procedure = require('../server/controllers/procedure.controller');
            var mockData = [
                { procedureID: '1.1', eventname: 'Alpha', title: 'Alpha Proc' }
            ];
            Procedure.find.yields(null, mockData);

            var req = {
                query: {},
                userMissionNames: ['Alpha', 'Bravo']
            };
            var res = { send: sinon.stub() };

            procedure.getProcedureList(req, res);

            // Should use the $in filter with mission names
            sinon.assert.calledWith(Procedure.find, { eventname: { $in: ['Alpha', 'Bravo'] } }, {}, sinon.match.func);
            expect(res.send.calledOnce).to.be.true;
            sinon.assert.calledWith(res.send, mockData);
        });

        it('should not filter procedures when userMissionNames is null (lead user)', function () {
            var procedure = require('../server/controllers/procedure.controller');
            Procedure.find.yields(null, []);

            var req = {
                query: {},
                userMissionNames: null
            };
            var res = { send: sinon.stub() };

            procedure.getProcedureList(req, res);

            // Should use empty filter (no mission restriction)
            sinon.assert.calledWith(Procedure.find, {}, {}, sinon.match.func);
        });

        it('should not filter when userMissionNames is undefined (backwards compat)', function () {
            var procedure = require('../server/controllers/procedure.controller');
            Procedure.find.yields(null, []);

            var req = { query: {} };
            var res = { send: sinon.stub() };

            procedure.getProcedureList(req, res);

            sinon.assert.calledWith(Procedure.find, {}, {}, sinon.match.func);
        });
    });
});
