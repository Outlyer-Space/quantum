var quantum = angular.module('quantum',
	['ngFileUpload', 'ngRoute', 'ngFileSaver','ngMaterial', 'ui.bootstrap', 'ui.select','xeditable','angularUtils.directives.dirPagination']);

quantum.constant('moment', moment);

// routes
// running angular is subdir: https://github.com/angular/angular.js/issues/2805
// Use *absolute* paths for "when" (will auto-prepend with <base>)
// Use *relative* paths for "templateURL" (will auto-prepend with <base>)
quantum.config(function($routeProvider, $locationProvider) {
	$routeProvider

	// route for the dashboard page with procedures list
	.when('/dashboard', {
		templateUrl : 'js/components/procedures/procedure.html',
		controller  : 'procedureCtrl'
	})

	//route for the individual procedure with steps
	.when('/dashboard/procedure/:procID', {
		templateUrl : 'js/components/sections/section.html',
		controller  : 'sectionCtrl'
	})

	//route for running index
	.when('/dashboard/procedure/running/:procID', {
		templateUrl : 'js/components/runIndex/running.html',
		controller  : 'runIndexCtrl'
	})

	 //route for archived index
	.when('/dashboard/procedure/archived/:procID', {
		templateUrl : 'js/components/archivedIndex/archived.html',
		controller  : 'archivedIndexCtrl'
	})

		//route for running instance
	.when('/dashboard/procedure/runninginstance/:procID/:versionID/:revisionID', {
		templateUrl : 'js/components/sections/section.html',
		controller  : 'runningInstanceCtrl'
	})

	 //route for archived instance
	.when('/dashboard/procedure/archivedinstance/:procID/:versionID/:revisionID', {
		templateUrl : 'js/components/sections/section.html',
		controller  : 'archivedInstanceCtrl'
	})

	//route for preview procedure instance
	.when('/dashboard/viewProcedure/:procID', {
		templateUrl : 'js/components/sections/preview.html',
		controller  : 'previewInstanceCtrl'
	})

	$locationProvider.html5Mode(true);
});

/* uncomment to debug / monitor routing issues
quantum.run([
	'$rootScope',
	function($rootScope) {
	  // see what's going on when the route tries to change
	  $rootScope.$on('$routeChangeStart', function(event, next, current) {
		// next is an object that is the route that we are starting to go to
		// current is an object that is the route where we are currently
		var currentPath = null
		var nextPath = null
		if (current){ currentPath = current.originalPath; }
		if (next   ){ nextPath = next.originalPath;       }
		console.log('Leaving:: %s, Loading :: %s', currentPath, nextPath);
	  });
	}
  ]);
*/

quantum.run(['editableOptions', function(editableOptions) {
  editableOptions.theme = 'bs3'; // bootstrap3 theme. Can be also 'bs2', 'default'
}]);
