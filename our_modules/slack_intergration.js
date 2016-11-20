// slack_intergration.js ~ Copyright 2016 Manchester Makerspace ~ License MIT

var slack = {
    webhook: require('@slack/client').IncomingWebhook, // url to slack intergration called "webhook" can post to any channel as a "bot"
    request: require('request'),                       // needed to make post request to slack api
    token: process.env.SLACK_TOKEN,                    // authentication to post as and invidual (in this case an admin user is needed to inivite new members)
    wh: null,                                          // webhook connection object if successfully connected
    init: function(channelToSentTo, startUpMsg){       // runs only once on server start up (may be we should timeout retrys)
        try {                                          // slack is not a dependancy, will fail softly if no internet or slack
            slack.wh = new slack.webhook(process.env.SLACK_WEBHOOK_URL, { // instantiate webhook (bot) w/ its url and profile
                username: 'doorboto',                  // Name of bot
                channel: channelToSentTo,              // channel that this intergration spams in particular
                iconEmoji: ':robot_face:',             // icon emoji that bot uses for a profile picture
            });
            slack.wh.send(startUpMsg);                 // Notes that server just started or restarted
        } catch(e){console.log('no connection to slack:' + e);} // handle not being connected
    },
    send: function(msg){
        try         {slack.wh.send(msg);}                                        // try to send
        catch(error){console.log('slack: No Sendy:'+ msg + ' - Cause:'+ error);} // fail softly if slack or internet is down
    },
    sendAndLog: function(msg){
        slack.send(msg);
        console.log(msg);
    },
    invite: function(email, newMember){
        try { // there are no errors only unexpected results
            var channels = '&channels=C050A22AL,C050A22B2,G2ADCCBAP,C0GB99JUF,C29L2UMDF,C0MHNCXGV,C1M5NRPB5,C14TZJQSY,C1M6THS3E,C1QCBJ5D3';
            // Channels - general, random, who_at_the_space , 36_old_granite, talk_to_the_board, automotive, electronics, rapid p, wood, metal
            var emailReq = '&email=' + email;               // NOTE: has to be a valid email, no + this or that
            var inviteAddress = 'https://slack.com/api/users.admin.invite?token=' + slack.token + emailReq + channels;
            slack.request.post(inviteAddress, function(error, response, body){
                var msg = 'NOT MADE';                       // default to returning a possible error message
                if(error){slack.failedInvite(error);}       // post request error
                else if (response.statusCode == 200){       // give a good status code
                    body = JSON.parse(body);
                    if(body.ok){                            // check if reponse body ok
                        msg = 'invite pending';             // if true, success!
                    } else {                                // otherwise
                        if(body.error){slack.failedInvite('error ' + body.error);} // log body error
                    }
                } else {                                    // maybe expecting possible 404 not found or 504 timeout
                    slack.failedInvite('other status ' + response.statusCode);   // log different status code
                }
                slack.send(newMember + ' just signed up! Slack invite: ' + msg); // regardless post registration event to whosAtTheSpace
            });
        } catch (e){slack.failedInvite(e);}                                      // fail softly in case there is no connection to outside
    },
    failedInvite: function(error){console.log('slack: invite failed:' + error);} // common fail message
};

module.exports = slack;
