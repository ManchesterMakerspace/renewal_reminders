// scheduled_check.js ~ Copyright 2016 Manchester Makerspace ~ License MIT
// millisecond conversions
var TWO_WEEKS= 1209600000;
var DAYS_13  = 1123200000;
var ONE_WEEK = 604800000;
var DAYS_6   = 518400000;
var ONE_DAY  = 86400000;

var slack = {
    io: require('socket.io-client'),                         // to connect to our slack intergration server
    firstConnect: false,
    connected: false,
    init: function(){
        try {
            slack.io = slack.io(process.env.MASTER_SLACKER); // slack https server
            slack.firstConnect = true;
        } catch (error){
            console.log('could not connect to ' + process.env.MASTER_SLACKER + ' cause:' + error);
            setTimeout(slack.init, 60000); // try again in a minute maybe we are disconnected from the network
        }
        if(slack.firstConnect){
            slack.io.on('connect', function authenticate(){  // connect with masterslacker
                slack.io.emit('authenticate', {
                    token: process.env.CONNECT_TOKEN,
                    slack: {
                        username: 'Renewal Reminders',
                        channel: 'test_channel',
                        iconEmoji: ':reminder_ribbon:'
                    }
                }); // its important lisner know that we are for real
                slack.connected = true;
            });
            slack.io.on('disconnect', function disconnected(){slack.connected = false;});
        }
    },
    send: function(msg){
        if(slack.connected){
            slack.io.emit('msg', msg);
        } else {
            console.log('404:'+msg);
        }
    }
};

var mongo = { // depends on: mongoose
    ose: require('mongoose'),
    init: function(db_uri){
        mongo.ose.connect(db_uri);                                                    // connect to our database
        var Schema = mongo.ose.Schema; var ObjectId = Schema.ObjectId;
        mongo.member = mongo.ose.model('member', new Schema({                         // create user object property
            id: ObjectId,                                                             // unique id of document
            fullname: { type: String, required: '{PATH} is required', unique: true }, // full name of user
            cardID: { type: String, required: '{PATH} is required', unique: true },   // user card id
            status: {type: String, Required: '{PATH} is required'},                   // type of account, admin, mod, ect
            accesspoints: [String],                                                   // points of access member (door, machine, ect)
            expirationTime: {type: Number},                                           // pre-calculated time of expiration
            groupName: {type: String},                                                // potentially member is in a group/partner membership
            groupKeystone: {type: Boolean},                                           // notes who holds expiration date for group
            groupSize: {type: Number},                                                // notes how many members in group given in one
            password: {type: String},                                                 // for admin cards only
            email: {type: String},                                                    // store email of member for prosterity sake
        }));
    }
};

var check = {
    now: function(parsingFunction){       // pass a function to iterate over a generic mongo stream
        var cursor = mongo.member.find({}).cursor();
        cursor.on('data', parsingFunction);
        cursor.on('close', check.onClose);
    },
    daily: function(){
        check.now(check.upcomming);       // stream results to slack
        setTimeout(check.daily, ONE_DAY); // make upcomming expiration check every interval
    },
    upcomming: function(memberDoc){       // check if this member is close to expiring (FOR 24 hours) does not show expired members
        if(memberDoc.groupName && !memberDoc.groupKeystone){return;} // skip group members
        if(memberDoc.status === 'Revoked'){return;}                  // we don't care to see revoked members there date doesnt matter
        var currentTime = new Date().getTime();
        var membersExpiration = new Date(memberDoc.expirationTime).getTime();
        if((currentTime + TWO_WEEKS) > membersExpiration && (currentTime + DAYS_13) < membersExpiration){ // if in two week window
            slack.send(memberDoc.fullname + " has two weeks left");  // Notify comming expiration
        } else if ((currentTime + ONE_WEEK) > membersExpiration && (currentTime + DAYS_6) < membersExpiration){
            slack.send(memberDoc.fullname + " has a week left");     // Notify comming expiration
        } else if ((currentTime + ONE_DAY) > membersExpiration && currentTime < membersExpiration){
            slack.send(memberDoc.fullname + " has a day left");      // Notify comming expiration
        }
    },
    nextTwoWeeksAndExpired: function(memberDoc){
        if(memberDoc.groupName && !memberDoc.groupKeystone){return;}  // skip group members
        if(memberDoc.status === 'Revoked'){return;}
        var currentTime = new Date().getTime();
        var membersExpiration = new Date(memberDoc.expirationTime).getTime();
        if(currentTime > membersExpiration){                          // if membership expired
            slack.send(memberDoc.fullname + "'s membership expired on " + new Date(memberDoc.expirationTime).toDateString()); // Notify expiration
        } else if (currentTime + TWO_WEEKS > membersExpiration){
            slack.send(memberDoc.fullname + " will expire on " + new Date(memberDoc.expirationTime).toDateString());
        }
    },
    onClose: function(){ // not sure how this could be helpfull but it is a streaming event type, maybe I'm missing something important
        // console.log('query closed'); // slack.send('finishing up');
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

mongo.init(process.env.MONGODB_URI);                                         // connect to our database
slack.init();                                                                // init in renewals channel
setTimeout(function(){check.now(check.nextTwoWeeksAndExpired);}, 9000);      // Broad expriation and warning check on start up
setTimeout(check.daily, getMillis.toTimeTomorrow(process.env.HOUR_TO_SEND)); // schedual checks daily for warnigs at x hour from here after
