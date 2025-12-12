quantum
.factory('timeService', ['moment', function(moment) {
    
    function getTime() {
        var days, h, m, s, clock, tyear;
        var time = moment().utc();

        if (time) {
            tyear = time.year();
            days = checkDays(time.dayOfYear());
            h = checkTime(time.hours());
            m = checkTime(time.minutes());
            s = checkTime(time.seconds());
            clock = days + "." + h + ":" + m + ":" + s + " UTC";
        } else {
            days = "000";
            h = "00";
            m = "00";
            s = "00";
            clock = days + "." + h + ":" + m + ":" + s + " UTC";
            tyear = "0000";
        }

        return {
            "today": time,
            "days": days, 
            "hours": h,
            "minutes": m,
            "seconds": s,
            "utc": clock,
            "year": tyear
        };
    }

    function checkTime(i) {
        return i < 10 ? "0" + i : i.toString();
    }

    function checkDays(d) {
        if (d < 10) {
            return "00" + d;
        } else if (d < 100) {
            return "0" + d;
        }
        return d;
    }

    return {
        getTime: getTime
    };
}]);
