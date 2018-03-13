// scheduled_check.js ~ Copyright 2016 Manchester Makerspace ~ License MIT
// millisecond conversions
var ONE_DAY = 86400000;
var DAYS_3  = ONE_DAY * 3;
var DAYS_6 = ONE_DAY * 6;
var DAYS_7 = ONE_DAY * 7;
var DAYS_13 = ONE_DAY * 13;
var DAYS_14 = ONE_DAY * 14;

var slack = {
    webhook: require('@slack/client').IncomingWebhook,   // url to slack intergration called "webhook" can post to any channel as a "bot"
    init: function(webhook, membersChannel, metricChannel){
        slack.membersChannel = {
            username: 'Reminder Bot',
            channel: membersChannel,
            iconEmoji: ':reminder_ribbon:'
        };
        slack.metricChannel = {
            username: 'Membership Stats',
            channel: metricChannel,
            iconEmoji: ':mag:'
        };
        slack.URL = webhook;
    },
    send: function(msg, useMetric){
        if(slack.URL === "false"){   // not a valid url
            console.log(msg);        // log messages if no webhook was given
        } else {
            var sendObj = {};
            if(useMetric){sendObj = new slack.webhook(slack.URL, slack.metricChannel);}
            else         {sendObj = new slack.webhook(slack.URL, slack.membersChannel);} // default to just outputting to membership channel
            sendObj.send(msg);
        }
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
    activeMembers: 0,
    now: function(){
        mongo.connectAndDo(function onconnect(db){
            check.stream(db.collection('members').find({}), db); // pass cursor from query and db objects to start a stream
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
            cursor.nextObject(function onMember(error, member){
                if(member){
                    check.upcomming(member);
                    check.stream(cursor, db);  // recursively move through all members in collection
                } else {
                    if(error){
                        slack.send('Error checking database, see logs');
                        console.log('on check: ' + error);
                    } else {        // given we have got to end of stream, list currently active members
                        setTimeout(check.memberCount, 4000);
                        db.close(); // close connection with database
                    }
                }
            });
        });
    },
    upcomming: function(memberDoc){              // check if this member is close to expiring (FOR 24 hours) does not show expired members
        if(memberDoc.status === 'Revoked' || memberDoc.status === 'nonMember'){return;}     // Skip over non members
        var currentTime = new Date().getTime();
        var membersExpiration = Number(memberDoc.expirationTime);
        if(membersExpiration > currentTime){check.activeMembers++;}                         // check and increment, if active member
        if((currentTime - ONE_DAY) < membersExpiration && currentTime > membersExpiration){
            if(memberDoc.subscription){slack.send('Subscription issue: ' + memberDoc.fullname + ' just expired');}
            else{slack.send(memberDoc.fullname + ' just expired');}
        }
        if(currentTime < membersExpiration && (currentTime + ONE_DAY) > membersExpiration){ // is member in date? if a day was added to today would they expire?
            if(memberDoc.subscription){}
            else{slack.send(memberDoc.fullname + ' is expiring today');}
        }
        if((currentTime + ONE_DAY) < membersExpiration && (currentTime + DAYS_3) > membersExpiration){
            if(memberDoc.subscription){}
            else{slack.send(memberDoc.fullname + ' is expiring in the next couple of days');} // if added a day to three days would member expire?
        }
        if((currentTime + DAYS_6) < membersExpiration && (currentTime + DAYS_7) > membersExpiration){ // if no ack and with in two weeks of expiring
            var expiry = new Date(memberDoc.expirationTime).toDateString();
            if(memberDoc.subscription){}
            else{slack.send(memberDoc.fullname + " will expire on " + expiry);} // Notify comming expiration to renewal channel
        }
    },
    memberCount: function(){
        slack.send('Currently we have ' + check.activeMembers + ' active members');
        check.activeMembers = 0;
    },
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
    slack.init(process.env.SLACK_WEBHOOK_URL, process.env.MEMBERS_CHANNEL, process.env.METRICS_CHANNEL);
    if(process.env.ONE_OFF === 'true'){
        check.now();
    } else {
        setTimeout(check.daily, getMillis.toTimeTomorrow(process.env.HOUR_TO_SEND)); // schedule checks daily for warnigs at x hour from here after
        var pkgjson = require('./package.json');
        console.log('Starting ' + pkgjson.name + ' version ' + pkgjson.version); // show version of package when restarted
    }
}

if(process.env.LAMBDA === 'true'){exports.start = startup;}
else                             {startup();}
