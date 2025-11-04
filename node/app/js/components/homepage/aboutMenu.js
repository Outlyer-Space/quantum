quantum.controller('aboutCtrl', function($scope, $filter, $uibModalInstance, userService, $window, procedureService) {
    var $ctrl = this;

    $ctrl.versionInfo = {
        version: 'Loading...',
        branch: 'Loading...',
        commit: 'Loading...'
    };

    // Service to fetch version info from API
    userService.getVersionInfo()
    .then(function(response) {
        if(response.status == 200) {
            $ctrl.versionInfo = response.data;
        } else {
            var position = "bottom right";
            var queryId = '#aboutsettingstoaster';
            var delay = 5000;
            $scope.aboutmessage = "Failed to load version information";
            var alertstatus = procedureService.displayAlert($scope.aboutmessage, position, queryId, delay);
        }
    })
    .catch(function(error) {
        console.error('Failed to fetch version info:', error);
        $ctrl.versionInfo = {
            version: 'Error',
            branch: 'Error',
            commit: 'Error'
        };
        var position = "bottom right";
        var queryId = '#aboutsettingstoaster';
        var delay = 5000;
        $scope.aboutmessage = "Error loading version information";
        var alertstatus = procedureService.displayAlert($scope.aboutmessage, position, queryId, delay);
    });

    // Function to close the about modal
    $ctrl.close = function() {
        $uibModalInstance.dismiss('cancel');
    };
});