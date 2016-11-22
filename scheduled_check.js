// scheduled_check.js ~ Copyright 2016 Manchester Makerspace ~ License MIT
// millisecond conversions
var TWO_WEEKS                 = 1209600000;
var A_DAY_LESS_THAN_TWO_WEEKS = 1123200000;
var ONE_WEEK                  = 604800000;
var A_DAY_LESS_THAN_ONE_WEEK  = 518400000;
var ONE_DAY                   = 86400000;
var WAIT_FOR_SLACK            = 50;
var slack = require('./our_modules/slack_intergration.js');                      // get slack send and invite methodes

var mongo = { // depends on: mongoose
    ose: require('mongoose'),
    init: function(){
        mongo.ose.connect(process.env.MONGODB_URI);                                   // connect to our database
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
    now: function(){
        var cursor = mongo.member.find({}).cursor();
        cursor.on('data', check.memberExpiredOrAboutTo);
        cursor.on('close', check.onClose);
    },
    scheduled: function(){
        var cursor = mongo.member.find({}).cursor();
        cursor.on('data', check.memberWarning);
        cursor.on('close', check.onClose);
    },
    every24hours: function(){
        check.scheduled();                       // stream results to slack
        setTimeout(check.every24hours, ONE_DAY); // 24 hours in milliseconds
    },
    memberWarning: function(memberDoc){          // check if this member is close to expiring (FOR 24 hours) does not show expired members
        if(memberDoc.groupName && !memberDoc.groupKeystone){return;} // skip group members
        if(memberDoc.status === 'Revoked'){return;}                  // we don't care to see revoked members there date doesnt matter
        var currentTime = new Date().getTime();
        var membersExpiration = new Date(memberDoc.expirationTime).getTime();
        if(currentTime + TWO_WEEKS > membersExpiration && currentTime + A_DAY_LESS_THAN_TWO_WEEKS < membersExpiration){ // if in two week window
            slack.send(member.fullname + " has two weeks left"); // Notify comming expiration
        } else if (currentTime + ONE_WEEK > membersExpiration && currentTime + A_DAY_LESS_THAN_ONE_WEEK < membersExpiration){
            slack.send(member.fullname + " has a week left");    // Notify comming expiration
        } else if (currentTime + ONE_DAY > membersExpiration && currentTime < membersExpiration){
            slack.send(member.fullname + " has a day left");     // Notify comming expiration
        }
    },
    memberExpiredOrAboutTo: function(memberDoc){
        if(memberDoc.groupName && !memberDoc.groupKeystone){return;}  // skip group members
        if(memberDoc.status === 'Revoked'){return;}
        var currentTime = new Date().getTime();
        var membersExpiration = new Date(memberDoc.expirationTime).getTime();
        if( currentTime > membersExpiration){                         // if membership expired
            slack.send(memberDoc.fullname + "'s membership expired on " + new Date(memberDoc.expirationTime).toDateString()); // Notify expiration
        } else if (currentTime + TWO_WEEKS > membersExpiration){
            slack.send(memberDoc.fullname + " will expire on " + new Date(memberDoc.expirationTime).toDateString());
        }
    },
    onClose: function(){
        slack.send('finishing up');
    }
};

mongo.init();
if(process.argv[2] === 'run_once'){                      // if we pass an argument run it now!
    slack.init('test_channel', 'Running Quick Check');   // init in renewals channel
    setTimeout(check.now, WAIT_FOR_SLACK);               // wait a bit for slack to start up then "check now"
} else {
    slack.init('test_channel', 'Scheduled expiration checker fired up'); // init in renewals channel
    setTimeout(check.now, WAIT_FOR_SLACK);
    var hourToSend = 7;                                       // provide defult run time
    if(typeof process.argv[2] === 'number' && process.argv[2] < 24){hourToSend = process.argv[2];} // and hour can be passed between 0 and 23
    var currentTime = new Date().getTime();                   // current millis from epoch
    var tomorrowAtX = new Date();                             // create date object for tomorrow
    tomorrowAtX.setDate(tomorrowAtX.getDate() + 1);           // point date to tomorrow
    tomorrowAtX.setHours(hourToSend, 0, 0, 0);                // set hour to send tomorrow
    var startInXMillis = tomorrowAtX.getTime() - currentTime; // subtract tomo millis from epoch from current millis from epoch
    slack.send('next Scheduled run is at ' + tomorrowAtX.toISOString());
    setTimeout(check.every24hours, startInXMillis); // wait a bit for slack to start up then run a check and schedual checks there after
}
