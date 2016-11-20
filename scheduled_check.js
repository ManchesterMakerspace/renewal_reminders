// scheduled_check.js ~ Copyright 2016 Manchester Makerspace ~ License MIT
// millisecond conversions
var TWO_WEEKS                 = 1209600000;
var A_DAY_LESS_THAN_TWO_WEEKS = 1123200000;
var ONE_WEEK                  = 604800000;
var A_DAY_LESS_THAN_ONE_WEEK  = 518400000;
var ONE_DAY                   = 86400000;
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
        var cursor = member.find({}).cursor();
        cursor.on('data', check.memberExpiredOrAboutTo);
        cursor.on('close', check.onClose);
    },
    scheduled: function(){
        var cursor = member.find({}).cursor();
        cursor.on('data', check.member);
        cursor.on('close', check.onClose);
    },
    every24hours: function(){
        check.scheduled();                       // stream results to slack
        setTimeout(check.every24hours, ONE_DAY); // 24 hours in milliseconds
    },
    memberWarning: function(memberDoc){          // check if this member is close to expiring (FOR 24 hours) does not show expired members
        var currentTime = new Date().getTime();
        var membersExpiration = new Date(memberDoc.expirationTime).getTime();
        if(currentTime - TWO_WEEKS > membersExpiration && currentTime - A_DAY_LESS_THAN_TWO_WEEKS < membersExpiration){ // if in two week window
            slack.send(member.fullname + " has two weeks left"); // Notify comming expiration
        } else if (currentTime - ONE_WEEK > membersExpiration && currentTime - A_DAY_LESS_THAN_ONE_WEEK < membersExpiration){
            slack.send(member.fullname + " has a week left");    // Notify comming expiration
        } else if (currentTime - ONE_DAY > membersExpiration && currentTime < membersExpiration){
            slack.send(member.fullname + " has a day left");     // Notify comming expiration
        }
    },
    memberExpiredOrAboutTo: function(memberDoc){
        var currentTime = new Date().getTime();
        var membersExpiration = new Date(memberDoc.expirationTime).getTime();
        if( currentTime > membersExpiration){                      // if membership expired
            slack.send(member.fullname + "'s membership expired"); // Notify expiration
        } else if (currentTime - TWO_WEEKS > membersExpiration){
            slack.send(member.fullname + " will expire on " + new Date(memberDoc.expirationTime).toDateString());
        }
    },
    onClose: function(){
        slack.send('full member check done');
    }
};

if(process.argv[2]){  // if we pass an argument run it now!
    slack.init('test_channel', 'one time check running'); // init in renewals channel
    check.now();                                          // run the check now
} else {
    slack.init('test_channel', 'scheduled expiration checker fired up'); // init in renewals channel
    check.every24hours();
}
