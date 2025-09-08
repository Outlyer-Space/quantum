// Defines valid step types

module.exports = {

    'types' : {

		// Information type steps (no action)
	    'HEADING' : {
	    	'description' : 'Section heading text',
	    },
	    'INFO' : {
	    	'description' : 'Supportive information for following steps',
	    },
	    'CAUTION' : {
	    	'description' : 'Possible equipment / system damage',
	    },
	    'WARNING' : {
	    	'description' : 'Possible health hazard or risk of injury',
	    },

		// Action type steps (operator response needed)
	    'ACTION' : {
	    	'description' : 'General operator action (default)',
	    },
	    'DECISION' : {
	    	'description' : 'Branch point between multiple procedure options',
	    },
	    'RECORD' : {
	    	'description' : 'Gather data and note in this step (input required)',
	    },
	    'VERIFY' : {
	    	'description' : 'Confirm system state (telemetry value, visual inspection, etc.)',
	    },

	}
};