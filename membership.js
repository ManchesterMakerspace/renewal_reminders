// membership.js ~ Copyright 2016 Manchester Makerspace ~ License MIT
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
        if(slack.URL){               // if given a url
            var sendObj = {};
            if(useMetric){sendObj = new slack.webhook(slack.URL, slack.metricChannel);}
            else         {sendObj = new slack.webhook(slack.URL, slack.membersChannel);} // default to just outputting to membership channel
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
    activeMembers: 0,
    paidRetention: 0,
    activeGroupMembers: 0,
    aquisitions: 0,
    losses: 0,
    potentialLosses: 0,
    onSubscription: 0,
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
        var date = new Date(); var currentTime = date.getTime();
        var currentMonth = date.getMonth(); // date of current month
        date.setMonth(currentMonth - 1);    // increment month
        var lastMonth = date.getTime();     // dete of proceeding month

        var membersExpiration = Number(memberDoc.expirationTime);
        var memberStart = Number(memberDoc.startDate);
        var expiry = new Date(memberDoc.expirationTime).toDateString();

        if(membersExpiration > currentTime){
            check.activeMembers++;                                  // check and increment, if active member
            if(memberDoc.groupName){check.activeGroupMembers++;}    // count signed up group members
            else {
                if(memberDoc.subscription){                         // only count subscription for current members in good standing
                    check.onSubscription++;
                } else {
                    if((currentTime + DAYS_14) > membersExpiration){ // if with in two weeks of expiring
                        check.potentialLosses++;
                        slack.send(memberDoc.firstname + ' ' + memberDoc.lastname + " needs to renew by " + expiry); // Notify comming expiration to renewal channel
                    }
                }
                check.paidRetention++;
                if(memberStart > lastMonth && memberStart < currentTime){check.aquisitions++;}
            }
        } else { if(!memberDoc.groupName && membersExpiration > lastMonth){check.losses++;} }

        if((currentTime - DAYS_14) < membersExpiration && currentTime > membersExpiration){ // if two weeks out of date regardless of whether they are on subscription or not
            slack.send(memberDoc.firstname + ' ' + memberDoc.lastname + '\'s key expired on ' + expiry, true);
        }
    },
    memberCount: function(){
        slack.send('Currently we have ' + check.activeMembers + ' members with keys to the space');
        slack.send('We have ' + check.paidRetention + ' individual members and ' + check.activeGroupMembers + ' group members', true);
        slack.send('In the past month we gained ' + check.aquisitions + ' and lost ' + check.losses + ' individual members', true);
        var longTermPrePaid = check.paidRetention - (check.onSubscription + check.potentialLosses); // calculate those not on sub but not at risk
        slack.send('There are ' + check.onSubscription + ' members on subscription, about ' + check.potentialLosses + ' at churn risk and about ' +
        longTermPrePaid + ' are long term pre-paid (more than 2 weeks out) ', true);
        check.activeMembers = 0;
        check.paidRetention = 0;
        check.activeGroupMembers = 0;
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
    var metricsChannel = event && event.METRICS_CHANNEL ? event.METRICS_CHANNEL : process.env.METRICS_CHANNEL; // if lambda passes something use it
    var membersChannel = event && event.MEMBERS_CHANNEL ? event.MEMBERS_CHANNEL : process.env.MEMBERS_CHANNEL; // Otherwise use env vars
    slack.init(process.env.SLACK_WEBHOOK_URL, membersChannel, metricsChannel);
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
