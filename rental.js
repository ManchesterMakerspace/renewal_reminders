// rental.js ~ Copyright 2018 Manchester Makerspace ~ License MIT
// millisecond conversions
var ONE_DAY = 86400000;
var DAYS_3  = ONE_DAY * 3;
var DAYS_6 = ONE_DAY * 6;
var DAYS_7 = ONE_DAY * 7;
var DAYS_13 = ONE_DAY * 13;
var DAYS_14 = ONE_DAY * 14;

var slack = {
    webhook: require('@slack/client').IncomingWebhook,   // url to slack intergration called "webhook" can post to any channel as a "bot"
    init: function(webhook, membersChannel){
        slack.membersChannel = {
            username: 'Reminder Bot',
            channel: membersChannel,
            iconEmoji: ':reminder_ribbon:'
        };
        slack.URL = webhook;
    },
    send: function(msg, useMetric){
        if(slack.URL){               // if given a url
            var sendObj = {};
            sendObj = new slack.webhook(slack.URL, slack.membersChannel);
            sendObj.send(msg);
        } else {console.log(msg);} // log messages if no webhook was given
    }
};

var mongo = {
    URI: process.env.MONGODB_URI,
    client: require('mongodb').MongoClient,
    connectAndDo: function(connected, failed){         // url to db and what well call this db in case we want multiple
        mongo.client.connect(mongo.URI, function onConnect(error, db){
            if(db){connected(db);} // passes database object so databasy things can happen
            else  {failed(error);} // what to do when your reason for existence is a lie
        });
    }
};

var check = {
    now: function(){
        mongo.connectAndDo(function onconnect(db){
            check.stream(db.collection('rentals').aggregate([{$lookup: {
                from: "members",
                localField: "member_id",
                foreignField: "_id",
                as: "member",
            }}]), db); // TODO run agregation // pass cursor from query and db objects to start a stream
        }, function onError(error){                              // doubt this will happen but Murphy
            slack.send('could not connect to database for whatever reason, see logs');
            console.log('connect error ' + error);
        });
    },
    daily: function(){                                           // intiates an information stream that is called daily
        check.now();
        setTimeout(check.daily, ONE_DAY);                        // make upcomming expiration check every interval
    },
    stream: function(cursor, db){
        process.nextTick(function onNextTick(){
            cursor.nextObject(function onRental(error, rental){
                if(rental){
                    check.upcomming(rental);
                    check.stream(cursor, db);  // recursively move through all members in collection
                } else {
                    if(error){
                        slack.send('Error checking database, see logs');
                        console.log('on check: ' + error);
                    } else {        // given we have got to end of stream, list currently active members
                        db.close(); // close connection with database
                    }
                }
            });
        });
    },
    upcomming: function(rentalDoc){              // check if this member is close to expiring (FOR 24 hours) does not show expired members
        var date = new Date(); var currentTime = date.getTime();
        var rentalExpiration = new Date(rentalDoc.expiration).getTime();
        var expiry = new Date(rentalDoc.expiration).toDateString();
        if(currentTime > rentalExpiration){
            if(rentalDoc.subscription){slack.send('Subscription issue: ' + rentalDoc.member[0].fullname + '\'s plot or locker expired on ' + expiry, true);}
            else{slack.send(rentalDoc.member[0].fullname + '\'s plot or locker expired on ' + expiry, true);}
        }
        if((currentTime + DAYS_14) > rentalExpiration && currentTime < rentalExpiration){                          // with in two weeks of expiring
            if(rentalDoc.subscription){}                                                                           // exclude those on subscription
            else{slack.send(rentalDoc.member[0].fullname + " needs to renew thier locker or plot by " + expiry);}  // Notify comming expiration to renewal channel
        }
    }
};

var getMillis = {
    toTimeTomorrow: function(hour){
        var currentTime = new Date().getTime();         // current millis from epoch
        var tomorrowAtX = new Date();                   // create date object for tomorrow
        tomorrowAtX.setDate(tomorrowAtX.getDate() + 1); // point date to tomorrow
        tomorrowAtX.setHours(hour, 0, 0, 0);            // set hour to send tomorrow
        return tomorrowAtX.getTime() - currentTime;     // subtract tomo millis from epoch from current millis from epoch
    }
};

function startup(event, context){
    var membersChannel = event && event.MEMBERS_CHANNEL ? event.MEMBERS_CHANNEL : process.env.MEMBERS_CHANNEL; // Otherwise use env vars
    slack.init(process.env.SLACK_WEBHOOK_URL, membersChannel);
    if(process.env.ONE_OFF === 'true'){                                              // Case that of just testing things out or running as a lambda function
        check.now();
    } else {                                                                         // Case of run as a self contained cron with pm2/jitploy
        setTimeout(check.daily, getMillis.toTimeTomorrow(process.env.HOUR_TO_SEND)); // schedule checks daily for warnigs at x hour from here after
        var pkgjson = require('./package.json');
        console.log('Starting ' + pkgjson.name + ' version ' + pkgjson.version);     // show version of package when restarted
    }
}

if(process.env.LAMBDA === 'true'){exports.start = startup;}
else                             {startup();}
