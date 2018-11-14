// reminders.js ~ Copyright 2016 Manchester Makerspace ~ License MIT
var ONE_DAY = 86400000; // millisecond conversion for a day
var DAYS_3  = ONE_DAY * 3;
var DAYS_6 = ONE_DAY * 6;
var DAYS_7 = ONE_DAY * 7;
var DAYS_13 = ONE_DAY * 13;
var DAYS_14 = ONE_DAY * 14;

var crypto = require('crypto');
var querystring = require('querystring');
var https = require('https');
var slack = {
    MEMBERSHIP_PATH: process.env.MEMBERSHIP_WEBHOOK,
    METRIC_PATH:     process.env.MR_WEBHOOK,
    send: function(msg, useMetric){
        var postData = JSON.stringify({'text': msg});
        var options = {
            hostname: 'hooks.slack.com', port: 443, method: 'POST',
            path: useMetric ? slack.METRIC_PATH : slack.MEMBERSHIP_PATH,
            headers: {'Content-Type': "application/json",'Content-Length': postData.length}
        };
        var req = https.request(options, function(res){}); // just do it, no need for response
        req.on('error', function(error){console.log(error);});
        req.write(postData); req.end();
    }
};

var mongoClient = require('mongodb').MongoClient;
var mongo = {
    startQuery: function(collection, query, stream, finish){
        mongoClient.connect(process.env.MONGODB_URI, function onConnect(error, db){
            if(db){ // pass cursor from query and db objects to start a stream
                mongo.stream(db.collection(collection).aggregate([{$lookup: query}]), db, stream, finish);
            } else if(error){
                slack.send('could not connect to database for whatever reason, see logs');
                console.log('connect error ' + error);
            }
        });
    },
    stream: function(cursor, db, stream, finish){
        process.nextTick(function onNextTick(){
            cursor.nextObject(function onDoc(error, doc){
                if(doc){
                    stream(doc);                               // action for each doc in stream
                    mongo.stream(cursor, db, stream, finish);  // recursively move through all members in collection
                } else {
                    if(error){
                        slack.send('Error checking database, see logs');
                        console.log('on check: ' + error);
                    } else {        // given we have got to end of stream, list currently active members
                        setTimeout(finish, 1000); // call finish function to compile gathered data
                        db.close(); // close connection with database
                    }
                }
            });
        });
    },
};

member = {
    activeMembers: 0,
    paidRetention: 0,
    activeGroupMembers: 0,
    aquisitions: 0,
    losses: 0,
    potentialLosses: 0,
    onSubscription: 0,
    collection: 'members',
    lookupQuery: {
        from: "groups",
        localField: "groupName",
        foreignField: "groupName",
        as: "group"
    },
    msg: {msg: 'Renewal Reminders', metric: 'Expirations and Metrics'},
    stream: function(memberDoc){              // check if this member is close to expiring (FOR 24 hours) does not show expired members
        if(memberDoc.status === 'Revoked' || memberDoc.status === 'nonMember'){return;}     // Skip over non members
        var date = new Date(); var currentTime = date.getTime();
        var currentMonth = date.getMonth(); // date of current month
        date.setMonth(currentMonth - 1);    // increment month
        var lastMonth = date.getTime();     // date of proceeding month
        // given that this is a group member assign group expiration time
        var membersExpiration = memberDoc.groupName ? memberDoc.group[0].expiry: memberDoc.expirationTime;
        var expiry = new Date(membersExpiration).toDateString();
        membersExpiration = Number(membersExpiration); // Coerse type to be a number just in case its a date object
        var memberStart = Number(memberDoc.startDate); // If this is a date object Number will convert to millis

        if(membersExpiration > currentTime){
            member.activeMembers++;                               // check and increment, if active member
            if(memberDoc.groupName){member.activeGroupMembers++;} // count signed up group members
            else {
                if(memberDoc.subscription){                           // only count subscription for current members in good standing
                    member.onSubscription++;
                } else {
                    if((currentTime + DAYS_14) > membersExpiration){ // if with in two weeks of expiring
                        member.potentialLosses++;
                        member.msg.msg += '\n' + memberDoc.firstname + ' ' + memberDoc.lastname + " needs to renew by " + expiry; // Notify comming expiration to renewal channel
                    }
                }
                member.paidRetention++;
                if(memberStart > lastMonth && memberStart < currentTime){member.aquisitions++;}
            }
        } else { if(!memberDoc.groupName && membersExpiration > lastMonth){member.losses++;} }

        if((currentTime - DAYS_14) < membersExpiration && currentTime > membersExpiration){ // if two weeks out of date regardless of whether they are on subscription or not
            member.msg.metric += '\n' + memberDoc.firstname + ' ' + memberDoc.lastname + '\'s key expired on ' + expiry;
        }
    },
    finish: function(){
        member.msg.msg += '\nCurrently we have ' + member.activeMembers + ' members with keys to the space';
        member.msg.metric += '\nWe have ' + member.paidRetention + ' individual members and ' + member.activeGroupMembers + ' group members';
        member.msg.metric += '\nIn the past month we gained ' + member.aquisitions + ' and lost ' + member.losses + ' individual members';
        var longTermPrePaid = member.paidRetention - (member.onSubscription + member.potentialLosses); // calculate those not on sub but not at risk
        member.msg.metric += '\nThere are ' + member.onSubscription + ' members on subscription, about ' + member.potentialLosses + ' at churn risk and about ' +
        longTermPrePaid + ' are long term pre-paid (more than 2 weeks out) ';
        return member.msg;
    }
};

var rental = {
    collection: 'rentals',
    lookupQuery: {
        from: "members",
        localField: "member_id",
        foreignField: "_id",
        as: "member"
    },
    msg: '',
    stream: function(doc){
        var date = new Date(); var currentTime = date.getTime();
        var rentalExpiration = new Date(doc.expiration).getTime();
        var expiry = new Date(doc.expiration).toDateString();
        var name = doc.member[0].firstname + ' ' + doc.member[0].lastname;
        if(currentTime > rentalExpiration){
            if(doc.subscription){slack.send('Subscription issue: ' + name + '\'s plot or locker expired on ' + expiry);}
            else{rental.msg += name + '\'s plot or locker expired on ' + expiry + '\n';}
        }
        if((currentTime + DAYS_14) > rentalExpiration && currentTime < rentalExpiration){           // with in two weeks of expiring
            if(doc.subscription){}                                                                  // exclude those on subscription
            else{rental.msg += name + " needs to renew thier locker or plot by " + expiry + '\n';}  // Notify comming expiration to renewal channel
        }
    },
    finish: function(){return {msg: rental.msg, metric: ''};}
};

var varify = {
    slack_sign_secret: process.env.SLACK_SIGNING_SECRET,
    request: function(event){
        var timestamp = event.headers['X-Slack-Request-Timestamp'];        // nonce from slack to have an idea
        var secondsFromEpoch = Math.round(new Date().getTime() / 1000);    // get current seconds from epoch because thats what we are comparing with
        if(Math.abs(secondsFromEpoch - timestamp > 60 * 5)){return false;} // make sure request isn't a duplicate
        var computedSig = 'v0=' + crypto.createHmac('sha256', varify.slack_sign_secret).update('v0:' + timestamp + ':' + event.body).digest('hex');
        return crypto.timingSafeEqual(Buffer.from(event.headers['X-Slack-Signature'], 'utf8'), Buffer.from(computedSig ,'utf8'));
    }
};

var app = {
    startup: function(collection, query, stream, finish){
        return function(event, context){
            if(event && event.METRICS_CHANNEL && event.MEMBERS_CHANNEL){ // give ability to test from different channels from lambda
                slack.MEMBERSHIP_PATH = event.MEMBERS_CHANNEL;
                slack.METRIC_PATH = event.METRICS_CHANNEL;
            }
            mongo.startQuery(collection, query, stream, function onFinish(){
                var msg = finish();
                // console.log(msg.msg + '\n' + msg.metric);
                slack.send(msg.msg); slack.send(msg.metric, true);
            });
        };
    },
    api: function(collection, query, stream, finish){
        return function lambda(event, context, callback){
            var body = querystring.parse(event.body);
            var response = {statusCode:403, headers: {'Content-type': 'application/json'}};
            if(varify.request(event)){
                response.statusCode = 200;
                if(body.channel_id === process.env.PRIVATE_VIEW_CHANNEL || body.user_name === process.env.ADMIN){
                    mongo.startQuery(collection, query, stream, function onFinish(){  // start db request before varification for speed
                        var msg = finish();                                 // run passed compilation totalling function
                        response.body = JSON.stringify({
                            'response_type' : body.text === 'show' ? 'in_channel' : 'ephemeral', // 'in_channel' or 'ephemeral'
                            'text' : msg.msg + '\n' + msg.metric
                        });
                        callback(null, response);
                    });
                } else {
                    console.log(body.user_name + ' is curious');
                    response.body = JSON.stringify({
                        'response_type' : 'ephemeral', // 'ephemeral' or 'in_channel'
                        'text' : 'This information can only be displayed in unauthorized channels',
                    });
                    callback(null, response);
                }
            } else {
                console.log('failed to varify signature :' + JSON.stringify(event, null, 4));
                callback(null, response);
            }
        };
    }
};

if(process.env.LAMBDA === 'true'){
    exports.member = app.startup(member.collection, member.lookupQuery, member.stream, member.finish);
    exports.rental = app.startup(rental.collection, rental.lookupQuery, rental.stream, rental.finish);
    exports.memberApi = app.api(member.collection, member.lookupQuery, member.stream, member.finish);
    exports.rentalApi = app.api(rental.collection, rental.lookupQuery, rental.stream, rental.finish);
} else {
    app.startup(member.collection, member.lookupQuery, member.stream, member.finish)(); // member test case
    app.startup(rental.collection, rental.lookupQuery, rental.stream, rental.finish)(); // rental test case
}
