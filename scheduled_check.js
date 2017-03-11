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
                        username: 'Renewal Bot',
                        channel: 'renewals',
                        // channel: 'test_channel',
                        iconEmoji: ':key:'
                    }
                }); // its important lisner know that we are for real
                slack.connected = true;
            });
            slack.io.on('disconnect', function disconnected(){slack.connected = false;});
        }
    },
    send: function(msg){
        if(slack.connected){ slack.io.emit('msg', msg);
        } else { console.log('404:'+msg); }
    },
    pm: function(handle, msg){
        if(slack.connected){ slack.io.emit('pm', {userhandle: handle, msg: msg});
        } else { console.log('404:'+msg);}
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
            slackHandle: {type: String},                                              // store slack username
            notificationAck: {type: Boolean},                                         // recognizes a notification was sent out
            expiredAck: {type: Boolean}                                               // recognizes doorboto was updated with expiration
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
        if(slack.connected){                         // if we are not connected to our slack server don't bother
            slack.send('Running renewal reminders'); // Just something to note that its still alive
            check.now(check.upcomming);              // stream results to slack
        } else {
            console.log('was not connected to slack on: ' + new Date().toDateString());
        }
        setTimeout(check.daily, ONE_DAY);        // make upcomming expiration check every interval
    },
    upcomming: function(memberDoc){              // check if this member is close to expiring (FOR 24 hours) does not show expired members
        if(memberDoc.groupName && !memberDoc.groupKeystone){return;} // skip group members
        if(memberDoc.status === 'Revoked'){return;}                  // we don't care to see revoked members there date doesnt matter
        var currentTime = new Date().getTime();
        var membersExpiration = new Date(memberDoc.expirationTime).getTime();

        if(memberDoc.notificationAck){                                    // in this way it doesnt have to exist
                                                                          // logic to remove ack needs to go into a renewal action
        } else if(membersExpiration < (currentTime + TWO_WEEKS)){         // if no ack and with in two weeks of expiring
            var expiry = new Date(memberDoc.expirationTime).toDateString();
            slack.send(memberDoc.fullname + " will expire on " + expiry); // Notify comming expiration to renewal channel
            if(memberDoc.slackHandle){                                    // if handle is in member doc
                var msg = 'Your membership expiration is:' + expiry;      // give member their expiration date
                msg += '\nyou can renew on our site: http://manchestermakerspace.org/join_now/';
                msg += '\nif you are on subscription, No worries we will update your manually update your card/fob, when we get your payment';
                msg += '\nThank You!,';
                msg += '\nRenewal Bot';
                slack.pm(memberDoc.slackHandle, msg);                    // private message member their expiration time
            } else {
                slack.send(memberDoc.fullname + ' needs to have their handle added to our db');
            }
            memberDoc.notificationAck = true;                            // signals that reminder has been sent
            memberDoc.save();                                            // does a intsert $set notificationAck = true
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

mongo.init(process.env.MONGODB_URI);                              // connect to our database
slack.init();                                                     // init in renewals channel
var runTime = getMillis.toTimeTomorrow(process.env.HOUR_TO_SEND); // gets millis till this hour tomorrow
// var runTime = 3000;                                             // test runtime
setTimeout(check.daily, runTime);                                 // schedual checks daily for warnigs at x hour from here after
