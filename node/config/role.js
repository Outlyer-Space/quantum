// Define valid user roles & call-signs
// https://en.wikipedia.org/wiki/Flight_controller#Common_flight_control_positions
module.exports = {

    'roles' : {

		// lead roles (only one at a time, full admin)
	    'FLIGHT' : {
	    	'name' : 'Flight Director',
	    	'callsign' : 'FLIGHT',
	    	'multiple' : false
	    },
	    'MD' : {
	    	'name' : 'Mission Director',
	    	'callsign' : 'MD',
	    	'multiple' : false
	    },
	    'TD' : {
	    	'name' : 'Test Director',
	    	'callsign' : 'TD',
	    	'multiple' : false
	    },

		// follow roles (can be multiple, e.g. CC1, CC2, etc.)
	    'CC' : {
	    	'name' : 'Spacecraft Communications Controller',
	    	'callsign' : 'CC',
	    	'multiple' : true
	    },
	    'SYS' : {
	    	'name' : 'Spacecraft Systems Controller',
	    	'callsign' : 'SYS',
	    	'multiple' : true
	    },
	    'GC' : {
	    	'name' : 'Ground Communications Controller',
	    	'callsign' : 'GC',
	    	'multiple' : true
	    },
	    'NAV' : {
	    	'name' : 'Navigation and Control Specialist',
	    	'callsign' : 'NAV',
	    	'multiple' : true
	    },
	    'IT' : {
	    	'name' : 'Information Technology Specialist',
	    	'callsign' : 'IT',
	    	'multiple' : true
	    },
	    'PROXY' : {
	    	'name' : 'Network and Encyption Specialist',
	    	'callsign' : 'PROXY',
	    	'multiple' : true
	    },
	    'TECH' : {
	    	'name' : 'Technician',
	    	'callsign' : 'TECH',
	    	'multiple' : true
	    },
	    'SIM' : {
	    	'name' : 'Simulation Specialist',
	    	'callsign' : 'SIM',
	    	'multiple' : true
	    },
	    'VIP' : {
	    	'name' : 'Observer',
	    	'callsign' : 'VIP',
	    	'multiple' : true
	    }
	}
};