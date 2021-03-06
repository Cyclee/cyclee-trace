/******************************* 
 * Development Options
 */

var write_to_carto = true;
var write_local_db = true;
var dropadd_local_db = false; // clear local DB
var reset_rideNum = false; // clear localStorage
var reset_distLifetime = false; // clear localStorage
var use_dummy_data = true; // true for off-phone browser dev


/******************************* 
 * Setup Variables & Local DB
 */

// setup CartoDB
var urlBase = "https://ideapublic.cartodb.com/api/v2/sql?";
var cartoKey = "api_key=XXXXXXXXX"; 

// setup ride vars
var gpsInterval = 5000; // milliseconds
var startLat, startLong,prevLat, prevLong; // used for rough distance
var distance, distLifetime, distRide = 0;
var userID = 17;
var username;
var rideID; // localStorage.rideNum
var counter=0;
var startTime, endTime;
var timer;
var timer_is_on=0;


function initBike() {
    // check for username
    if ( !localStorage.getItem('username') ) { 
        //window.location.href = "settings.html"
        console.log('New User?');
        newuser();
    }
    else {
        username = localStorage.getItem('username');
        console.log("username: " + username); 
    }
    lifetimeDistance();
}


function newuser(){
    $('#stats').hide();
    $('#maplink').hide();
    $('body').prepend('<div id="settings"><form><p>Choose a public username.</p><input id="username" placeholder="username" /><input type="submit" value="Submit" /><br /></form></div>');
    $('#settings input:submit').click( function(){
        saveSettings(); 
        return false;
    });
}


// set up local storage
if (reset_rideNum) { 
    console.log("clear ride number"); 
    localStorage.removeItem('rideNum'); 
}
if ( !localStorage.getItem('rideNum') ) { 
    console.log("init ride number"); 
    localStorage.setItem('rideNum',0);
}
localStorage.setItem('userID',userID);
rideID = Number(localStorage.rideNum); // convert, stored as string.


// set up local db
var db = openDatabase('bikedb', '1.0', 'bikedb', 2 * 1024);
if (dropadd_local_db) { dbDrop(); }
else { init_db(); }



/******************************* 
 * User Actions
 */

// start ride: triggered by user

function iotbike() {

    console.log('start');
    if (timer_is_on == 0) {
        timer_is_on=1;
        toggleUI();

        rideID = rideID + 1;
        $('#distance').html("0.00 km");

        startTime = new Date();
        startTimer();
        console.log("rideID " + rideID +" started at " + startTime.toLocaleTimeString() );

        localStorage.setItem('rideNum',rideID);
        feedback(); // could be run on CartoDB xmlHttp.responseText

        if (!use_dummy_data) { bikeLocation(); }
        else { fakeLocation(); }  

        //*** js in main.js
            // toggleAccel(); 
            // toggleCompass();   
            // check_net_connection();
        
        vibrate();

    }
}; 


// stop ride: triggered by user
function iotOff() {
    timer_is_on=0;
    toggleUI();
    endTime = new Date();
    var elapsed = Math.round( (endTime - startTime)/1000 );
    
    var startMinutes = startTime.getMinutes();
    var endMinutes = endTime.getMinutes();
    
    distLifetime = distLifetime + distRide;
    localStorage.setItem('distLifetime',distLifetime);
    lifetimeDistance();
    
    console.log("rideID " + rideID +" complete: " + distRide +" meters & " + counter +" points in " + elapsed + " seconds.");
    console.log("lifetime Distance " + distLifetime );
    
    cartodbLine(rideID);
    // could clear local DB if cartodbLine returns ok

    alert("Ride #" + rideID + " is complete with " + distRide + " meters.");
    counter = 0;
    vibrate();
    //rideCheck();
}



/******************************* 
 * Interface
 */


function toggleUI() {
    if ( timer_is_on == 1 ) { 
        $('#start').hide();
        $('#stop').show();
        $('#maplink').hide();
        $('#time').css('color','#fff');
    }
    else {
        $('#start').show();
        $('#stop').hide();
        $('#maplink').show();
        $('#time').css('color','#aaa');
    }    
}

// data to UI
// could be run on CartoDB xmlHttp.responseText
function feedback() {    
    $('#ride-number').html("Ride #" + rideID);
    $('#opendata').html("Data transmission log. User: " + userID + ". Ride: " + rideID + ". ");
}

function initmap() {
    console.log('init map');
    username = localStorage.getItem('username');
    var mapurl = "https://ideapublic.cartodb.com/tables/rides/embed_map?sql=SELECT%20*%20FROM%20rides%20where%20username%3D'"+username +"'";    
    $('#mapframe').attr('src',mapurl);
}
function mapall() {
    var mapurl = "https://ideapublic.cartodb.com/tables/rides/embed_map";    
    $('#mapframe').attr('src',mapurl);
}


/******************************* 
 * User & Ride Data
 */


// smartly random for fakeLocation()
    var randX = Math.round( Math.random() * 10 ) / 10 ; // start location
    var randY = Math.round( Math.random() * 10 ) / 10 ;
    var randA = Math.random()/5000; // speed
    var randB = Math.random()/5000;

function fakeLocation() {

    if (timer_is_on==1) {
    
        var lati = 40.3 + randX + (randA * counter) - (Math.random()/90000); // random variation
        var longi = -74.5 + randY + (randB * counter) - (Math.random()/90000);
        // -74.0, 40.7 NYC

        // grab location to calc distance
        if ( counter == 0 ) { 
            startLat = lati;
            startLong = longi;
            distance = 0;
            distRide = 0;
            // console.log(startLat,startLong);
            }
         else {             
             rideDistance(prevLat,prevLong,lati,longi);
    		}


        // console.log("point #" + counter + " lati:" + lati + " longi:" + longi );

        dbWrite(rideID,counter,lati,longi,distance,distRide);
        cartodbTrace(rideID,counter,lati,longi);
        openthedata(counter,lati,longi,distance);

        counter=counter+1;
        prevLat = lati;
        prevLong = longi;
        timer=setTimeout("fakeLocation()",gpsInterval);    
    }
    else { ; }
}

// location by GPS
function bikeLocation() {
    
        var getBikeLocation = function() {
            var geoSuccess = function(p) {
        
                var lati = p.coords.latitude;
                var longi = p.coords.longitude;
                                
                // set initial dist to 0
                if ( counter == 0 ) { 
                    startLat = lati;
                    startLong = longi;
                    distance = 0;
                    distRide = 0;
                    // console.log(startLat,startLong);
                    }
                 else { // calculate distance
                     rideDistance(prevLat,prevLong,lati,longi);
            		}

                dbWrite(rideID,counter,lati,longi,distance,distRide);
                cartodbTrace(rideID,counter,lati,longi);
                openthedata(counter,lati,longi,distance);

                // could be used save data locally and then send when online:
                // https://github.com/alexgibson/OfflineForm/blob/master/offlineData.js
              
                counter=counter+1; // increment only on success?
                prevLat = lati; // set location for next distance measurement
                prevLong = longi;
                
            }; // end if success
            var geoFail = function() {
                // write failure to cartoDB ??
            };
            navigator.geolocation.getCurrentPosition(geoSuccess, geoFail);
            timer=setTimeout("bikeLocation()",gpsInterval);      
        };

    if (timer_is_on==1) {
        getBikeLocation();    
    }
}


// reveal data to the user
function openthedata(counter,lati,longi) {
    $('#opendata').append( "Point: " + counter + ". ");
    $('#opendata').append("Lat: " + lati + ". ");
    $('#opendata').append("Long: " + longi + ". ");
}


// mobile connect status
function check_net_connection() {
    var networkState = navigator.network.connection.type;

    var states = {};
    states[Connection.UNKNOWN]  = 'Unknown';
    states[Connection.ETHERNET] = 'Ethernet';
    states[Connection.WIFI]     = 'WiFi';
    states[Connection.CELL_2G]  = '2G';
    states[Connection.CELL_3G]  = '3G';
    states[Connection.CELL_4G]  = '4G';
    states[Connection.NONE]     = 'No connection';

    var net_connect = states[networkState];
    $('#connection').html(net_connect); 
}


/******************************* 
 * CartoDB
 */

// add point to CartoDB
function cartodbTrace(rideID,count,lati,longi) {
    //INSERT A GPS TRACE

    if (write_to_carto) { // if write_to_carto AND timer_is_on ??

        var gpsTimestamp ="now()";
        // var sqlInsert ="&q=SELECT count(*) FROM gps_traces";
        var sqlInsert ="&q=INSERT INTO gps_traces(gps_timestamp,ride_id,trace_id,username,the_geom) VALUES("+ gpsTimestamp +","+ rideID +","+ count +",'"+ username +"',ST_SetSrid(st_makepoint("+ longi +","+ lati +"),4326))";
        var theUrl = urlBase + cartoKey + sqlInsert;

        // console.log("rideID:" + rideID + ", trace:" + counter); 

        $.getJSON(theUrl, function(data){
            // console.log('getjson ok');
            // console.log(data);
            $.each(data.rows, function(key, val) {
               // do something!
            });
        });
    }
}

// ride complete. make line in CartoDB from points.
function cartodbLine(rideID) {
    //CREATE THE RIDE LINE (WHEN DONE)

    if (write_to_carto) { 

        var sqlInsert = "&q=INSERT INTO rides(the_geom,username,ride_id) SELECT ST_Multi(ST_MakeLine(traces.the_geom)) as the_geom,'"+ username +"' as username,"+ rideID +" as ride_id FROM (SELECT the_geom, username FROM gps_traces WHERE username='"+ username +"' AND ride_id="+ rideID +") as traces";
        var theUrl = urlBase + cartoKey + sqlInsert;

        $.getJSON(theUrl, function(data){
            console.log("Line written to Carto for RideID: " + rideID ); 
            console.log(data);
        });

    }
}




/******************************* 
 * Local DB
 */

function dbStatus() {
    db.transaction(function (tx) {
        tx.executeSql('SELECT * FROM bikedb', [], function (tx, results) {
            var dbtotal = results.rows.length;            
        }, function (tx, err) {
            console.log("Error: "+ err.message);
        });
    });
}

function dbDrop() {
    db.transaction(function (tx) {
        tx.executeSql('DROP TABLE bikedb');
        console.log("db dropped");
        init_db(); 
    }, function (err) {
        console.log( "Drop error: " + err.message);
        init_db(); 
    });
}

function init_db() {
    db.transaction(function (tx) {
        tx.executeSql('CREATE TABLE IF NOT EXISTS bikedb (dbkey INTEGER PRIMARY KEY, userid INTEGER, rideid INTEGER, count INTEGER, lati INTEGER, longi INTEGER, distance INTEGER, distRide INTEGER)');  
        console.log("db init");
    });
}

function dbWrite(rideid,thecount,lati,longi,distance) {
    if (write_local_db) {
        //console.log("write to localDB");
        var userid = userID;
        db.transaction(function (tx) {
            //tx.executeSql('INSERT INTO bikedb (count, lati, longi) VALUES ("'+ counter + '", "'+ lati +'", "'+ longi +'")' );
            tx.executeSql('INSERT INTO bikedb (userid, rideid, count, lati, longi, distance, distRide) VALUES (?,?,?,?,?,?,?);',[userid,rideid,thecount,lati,longi,distance,distRide] );
        });
        dbStatus();
    }
}

// check ride data
// not currently in use
// could be used to confirm localStorage.rideNum
// could be used to estimate elapsed time & ride distance
function rideCheck() {
    db.transaction(function (tx) {
        tx.executeSql('SELECT * FROM bikedb ORDER BY rideid DESC', [], function (tx, results) {
            var themax = results.rows.item(0).rideid;
            console.log("last ride: ",themax);
        }, function (tx, err) {
            console.log( "rideCheck Error: " + err.message );
        });
    });
}



/******************************* 
 * Distance
 * calculate each interval & aggregate the ride
 */


 // clear lifetime distance
 if (reset_distLifetime) { 
     console.log("clear lifetime distance"); 
     localStorage.removeItem('distLifetime'); 
 }
 // check total distance
 function lifetimeDistance() {
     if ( !localStorage.getItem('distLifetime') ) { 
         console.log("init lifetime distance"); 
         localStorage.setItem('distLifetime',0);
     }
     distLifetime = Number(localStorage.distLifetime); // convert, stored as string.
     $('#dist-Lifetime').html(displayDistance(distLifetime)); 
 }


function rideDistance(lat1,lon1,lat2,lon2) {    

	unit = "K";	

	var radlat1 = Math.PI * lat1/180
	var radlat2 = Math.PI * lat2/180
	var radlon1 = Math.PI * lon1/180
	var radlon2 = Math.PI * lon2/180
	var theta = lon1-lon2
	var radtheta = Math.PI * theta/180
	var dist = Math.sin(radlat1) * Math.sin(radlat2) + Math.cos(radlat1) * Math.cos(radlat2) * Math.cos(radtheta);
	dist = Math.acos(dist)
	dist = dist * 180/Math.PI
	dist = dist * 60 * 1.1515
	if (unit=="K") { dist = dist * 1.609344 }
	if (unit=="N") { dist = dist * 0.8684 }
	
	// alert(dist+"km");
	distance = Math.round(dist * 1000); // km to meters
	distRide +=  distance; 
	
	$('#distance').html(displayDistance(distRide));
            
}


// display meters as km 
function displayDistance(distRide){
    
    var distString = distRide.toString(); 
	var distKm;
	var distM;
	// console.log(distRide,distString,distString.length);

    // extract km
	if ( distString.length > 4 ) { // if 10000+ meters
        distKm = distString.substr(-5,2); // get km
	    }
	else if ( distString.length > 3 ) { // if 1000+ meters
        distKm = distString.substr(-4,1); // get km
	    }
	else { distKm = 0;}
	
    // extract m
	if ( distString.length > 2 ) { // if 100+ meters
        distM = distString.substr(-3,2); // get km decimal
	    }
	else if ( distString.length > 1 ) { // if 10+ meters
        distM = "0" + distString.substr(-2,1); // get km decimal
	    }
	else { distM = "00";}
	
	// console.log(distKm,distM);

	var output = distKm + "." + distM + " km";	
	return output; 
}



/******************************* 
 * Elapsed Timer
 */

function startTimer() {
    var today=new Date();
    var elapsed = (today - startTime)/1000;

    var days = 0;
    var hours = Math.floor((elapsed - (days * 86400 ))/3600);
    var minutes = Math.floor((elapsed - (days * 86400 ) - (hours *3600 ))/60);
    var secs = Math.floor((elapsed - (days * 86400 ) - (hours *3600 ) - (minutes*60)));

    // add a zero in front of numbers<10
    minutes=checkTimer(minutes);
    secs=checkTimer(secs);

    if (timer_is_on==1) {
        $('#time').html(hours+":"+minutes+":"+secs);
        t=setTimeout('startTimer()',500);
    }
}

function checkTimer(i) {
    if (i<10) {
        i="0" + i;
    }
    return i;
}



/******************************* 
 * User Settings
 */

function saveSettings() {
    localStorage.username = $('#username').val();
    console.log("saved username: " + localStorage.username);
    //localStorage.email = $('#email').val();
    //console.log("saved email: " + localStorage.email);
    
    window.location.href = "index.html"
    return false;
}

function loadSettings() {
	if (!localStorage.username) {
	    localStorage.username = "";
	}
    $('#username').val( localStorage.username );
    $('#settings').show();    
}

function deleteSettings() {
    var del=confirm("Delete Username?\nYou will lose access to your past rides.");    
    if (del==true) {
        localStorage.username = "";
        console.log("username removed");
        loadSettings();        
    }
    return false;
}


