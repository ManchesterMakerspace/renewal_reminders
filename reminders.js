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
    URL: process.env.SLACK_WEBHOOK_URL,
    live: process.env.LIVE,
    send: function(msg){
        properties = {
            username: 'Renewal Bot',
            channel: slack.live === 'true' ? 'renewal_reminders' : 'test_channel', // if not live send all messages to test channel
            iconEmoji: ':key:'
        };
        var sendObj = new slack.webhook(slack.URL, properties);
        sendObj.send(msg);
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
            status: {type: String, required: '{PATH} is required'},                   // type of account, admin, mod, ect
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
    activeMembers: 0,
    now: function(parsingFunction){       // pass a function to iterate over a generic mongo stream
        var cursor = mongo.member.find({}).cursor();
        cursor.on('data', parsingFunction);
        cursor.on('close', check.onClose);
    },
    daily: function(){
        check.now(check.upcomming);              // stream results to slack
        setTimeout(check.daily, ONE_DAY);        // make upcomming expiration check every interval
    },
    upcomming: function(memberDoc){              // check if this member is close to expiring (FOR 24 hours) does not show expired members
        if(memberDoc.status === 'Revoked' || memberDoc.status === 'nonMember'){return;}     // Skip over non members
        var currentTime = new Date().getTime();
        var membersExpiration = new Date(memberDoc.expirationTime).getTime();
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
            {slack.send(memberDoc.fullname + ' is expiring in the next couple of days');}    // if added a day to three days would member expire?
        }
        if((currentTime + DAYS_6) < membersExpiration && (currentTime + DAYS_7) > membersExpiration){ // if no ack and with in two weeks of expiring
            var expiry = new Date(memberDoc.expirationTime).toDateString();
            if(memberDoc.subscription){}
            else{slack.send(memberDoc.fullname + " will expire on " + expiry);} // Notify comming expiration to renewal channel
        }
    },
    onClose: function(){ // not sure how this could be helpfull but it is a streaming event type, maybe I'm missing something important
        setTimeout(check.memberCount, 15000); // onClose is just when the query is finished, not when the data has been processed
    },
    memberCount: function(){
        slack.send('Currently we have ' + check.activeMembers + ' active members');
        check.activeMembers = 0;
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
if(slack.live === 'true'){
    setTimeout(check.daily, getMillis.toTimeTomorrow(process.env.HOUR_TO_SEND)); // schedule checks daily for warnigs at x hour from here after
} else {                                                          // testing route
    console.log('starting renewal reminders');
    setTimeout(check.daily, 3000); // give it some time to connect to masterslacker
}
