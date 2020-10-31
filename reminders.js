// reminders.js ~ Copyright 2016 Manchester Makerspace ~ License MIT
var ONE_DAY = 86400000; // millisecond conversion for a day
var DAYS_3  = ONE_DAY * 3;
var DAYS_6 = ONE_DAY * 6;
var DAYS_7 = ONE_DAY * 7;
var DAYS_13 = ONE_DAY * 13;
var DAYS_14 = ONE_DAY * 14;
var DB_NAME = process.env.DB_NAME;

var MongoClient = require('mongodb').MongoClient;
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
    },
    im: function(user_id, msg){
        var postData = '{"channel": "'+user_id+'", "text":"'+ msg + '"}';
        var options = {
            hostname: 'slack.com', port: 443, method: 'POST',
            path: '/api/chat.postMessage',
            headers: {'Content-type': 'application/json','Content-Length': postData.length, Authorization: 'Bearer ' + process.env.BOT_TOKEN}
        };
        var req = https.request(options, function(res){}); // just do it, no need for response
        req.on('error', function(error){console.log(error);});
        req.write(postData); req.end();
    }
};

var mongo = {
    startQuery: function(collection, aggregation, stream, finish){
        MongoClient.connect(process.env.MONGODB_URI, {useNewUrlParser: true}, function onConnect(connectError, client){
            if(client){ // pass cursor from query and db objects to start a stream
                mongo.stream(client.db(DB_NAME).collection(collection).aggregate(aggregation), client, stream, finish);
            } else if(connectError){
                slack.send('could not connect to database for whatever reason, see logs');
                console.log('connect error ' + connectError);
            }
        });
    },
    stream: function(cursor, client, stream, finish){
        process.nextTick(function onNextTick(){
            cursor.next(function onDoc(error, doc){
                if(doc){
                    stream(doc);                               // action for each doc in stream
                    mongo.stream(cursor, client, stream, finish);  // recursively move through all members in collection
                } else {
                    if(error){
                        slack.send('Error checking database, see logs');
                        console.log('on check: ' + error);
                    } else {                      // given we have got to end of stream, list currently active members
                        setTimeout(finish, 1000); // call finish function to compile gathered data
                        client.close();           // close connection with database
                    }
                }
            });
        });
    },
};

var member = {
    activeMembers: 0,
    paidRetention: 0,
    aquisitions: 0,
    losses: 0,
    potentialLosses: 0,
    onSubscription: 0,
    collection: 'members',
    aggregation: [
        {$lookup:{ from: "slack_users", localField: "_id", foreignField: "member_id", as: "slack_user"}},
        {$project: {
            fullname: {$concat: ['$firstname', ' ', '$lastname']},
            expirationTime: 1, startDate: 1, status: 1, subscription: 1, firstname: 1,
            slack_id: {$arrayElemAt: ['$slack_user.slack_id', 0]}
        }}
    ],
    msg: {msg: 'Renewal Reminders', metric: 'Expirations and Metrics'},
    stream: function(requester){
        return function(memberDoc){ // check if this member is close to expiring (FOR 24 hours) does not show expired members
            if(memberDoc.status === 'Revoked' || memberDoc.status === 'nonMember'){return;}     // Skip over non members
            var date = new Date(); var currentTime = date.getTime();
            var currentMonth = date.getMonth(); // date of current month
            date.setMonth(currentMonth - 1);    // increment month
            var lastMonth = date.getTime();     // date of previous month
            var expiry = new Date(memberDoc.expirationTime).toDateString();
            memberDoc.expirationTime = Number(memberDoc.expirationTime); // Coerse type to be a number just in case its a date object
            var memberStart = Number(memberDoc.startDate); // If this is a date object Number will convert to millis

            if(memberDoc.expirationTime > currentTime){
                member.activeMembers++;                               // check and increment, if active member
                if(memberDoc.subscription || memberDoc.subscription_id){   // only count subscription for current members in good standing
                    member.onSubscription++;
                } else {
                    if((currentTime + DAYS_14) > memberDoc.expirationTime){ // if with in two weeks of expiring
                        member.potentialLosses++;
                        if(requester){
                            slack.im(requester, memberDoc.fullname + " needs to renew by " + expiry);
                        } else {
                            slack.send(memberDoc.fullname + " needs to renew by " + expiry);
                            slack.im(memberDoc.slack_id,
                                'Hey ' + memberDoc.firstname +
                                '! just a heads up, you may need to renew membership soon on ' + expiry +
                                '.\nThere are cases that this message sends when on subscription. If so we\'ll renew you as soon as your payment comes through. ' +
                                '\nIf not on subscription it is possible to sign up here - https://manchestermakerspace.org/membership/ ' +
                                ' Thank you for being a part of the makerspace! Please reach out in #membership with any questions.'
                            );
                        }
                    }
                }
                member.paidRetention++;
                if(memberStart > lastMonth && memberStart < currentTime){member.aquisitions++;}
            } else { if(memberDoc.expirationTime > lastMonth){member.losses++;} }

            if((currentTime - DAYS_14) < memberDoc.expirationTime && currentTime > memberDoc.expirationTime){ // if two weeks out of date regardless of whether they are on subscription or not
                if(requester){slack.im(requester, memberDoc.fullname + '\'s key expired on ' + expiry);}
                else         {slack.send(memberDoc.fullname + '\'s key expired on ' + expiry, true);}
            }
        };
    },
    finish: function(){
        member.msg.metric += '\nCurrently we have ' + member.activeMembers + ' members with keys to the space';
        member.msg.metric += '\nWe have ' + member.paidRetention + ' individual members';
        member.msg.metric += '\nIn the past month we gained ' + member.aquisitions + ' and lost ' + member.losses + ' individual members';
        var longTermPrePaid = member.paidRetention - (member.onSubscription + member.potentialLosses); // calculate those not on sub but not at risk
        member.msg.metric += '\nThere are ' + member.onSubscription + ' members on subscription, about ' + member.potentialLosses + ' at churn risk and about ' +
        longTermPrePaid + ' are long term pre-paid (more than 2 weeks out) ';
        return member.msg;
    }
};

var rental = {
    collection: 'rentals',
    aggregation: [{$lookup: {
        from: "members",
        localField: "member_id",
        foreignField: "_id",
        as: "member"
    }}],
    msg: '',
    stream: function(requester){
        return function(doc){
            var date = new Date(); var currentTime = date.getTime();
            var rentalExpiration = new Date(doc.expiration).getTime();
            var expiry = new Date(doc.expiration).toDateString();
            var name = doc.member[0].firstname + ' ' + doc.member[0].lastname;
            if(currentTime > rentalExpiration){
                if(requester){
                    slack.im(requester, name + '\'s plot or locker expired on ' + expiry);
                } else {
                    if(doc.subscription || doc.subscription_id){slack.send('Subscription issue: ' + name + '\'s plot or locker expired on ' + expiry);}
                    else                {slack.send(name + '\'s plot or locker expired on ' + expiry);}
                }
            }
            if((currentTime + DAYS_14) > rentalExpiration && currentTime < rentalExpiration){           // with in two weeks of expiring
                if(requester){
                    slack.im(requester, name + " needs to renew thier locker or plot by " + expiry);
                } else {
                    if(doc.subscription || doc.subscription_id){}                                  // exclude those on subscription
                    else{slack.send(name + " needs to renew thier locker or plot by " + expiry);}  // Notify comming expiration to renewal channel
                }
            }
        };
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
    cron: function(collection, query, stream, finish){
        return function(event, context){
            if(event && event.METRICS_CHANNEL && event.MEMBERS_CHANNEL){ // give ability to test from different channels from lambda
                slack.MEMBERSHIP_PATH = event.MEMBERS_CHANNEL;
                slack.METRIC_PATH = event.METRICS_CHANNEL;
            }
            mongo.startQuery(collection, query, stream(), function onFinish(){
                var msg = finish();
                slack.send(msg.msg); slack.send(msg.metric, true);
            });
        };
    },
    api: function(collection, query, stream, finish){
        return function lambda(event, context, callback){
            var body = querystring.parse(event.body);
            var response = {statusCode:403, headers: {'Content-type': 'application/json'}};
            if (process.env.NODE_ENV === "test" || varify.request(event)){
                response.statusCode = 200;
                if(body.channel_id === process.env.PRIVATE_VIEW_CHANNEL){
                    mongo.startQuery(collection, query, stream(body.user_id), function onFinish(){  // start db request before varification for speed
                        var msg = finish();                                 // run passed compilation totalling function
                        slack.im(body.user_id, msg.msg + '\n' + msg.metric);
                        response.body = JSON.stringify({
                            'response_type' : 'ephemeral', // 'in_channel' or 'ephemeral'
                            'text' : 'Check your slackbot for results'
                        });
                        callback(null, response);
                    });
                } else {
                    slack.send(body.user_name + ' is looking for access to renewal slash commands', true);
                    response.body = JSON.stringify({
                        'response_type' : 'ephemeral', // 'ephemeral' or 'in_channel'
                        'text' : 'This information is only displayed in members-relation channel, requesting access, thanks for your curiousity :)',
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

exports.member = app.cron(member.collection, member.aggregation, member.stream, member.finish);
exports.rental = app.cron(rental.collection, rental.aggregation, rental.stream, rental.finish);
exports.memberApi = app.api(member.collection, member.aggregation, member.stream, member.finish);
exports.rentalApi = app.api(rental.collection, rental.aggregation, rental.stream, rental.finish);
// if(!module.parent){} // run stand alone test
