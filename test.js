require('dotenv').config();
var reminders = require('./reminders');
var querystring = require('querystring');

reminders.member({
  body: querystring.stringify({
    user_id: process.env.USER_ID,
    user_username: process.env.USERNAME,
    channel_id: process.env.PRIVATE_VIEW_CHANNEL,
  }),
}, undefined, (nothing, response) => console.log("RESPONSE", response));

reminders.rental({
  body: querystring.stringify({
    user_id: process.env.USER_ID,
    user_username: process.env.USERNAME,
    channel_id: process.env.PRIVATE_VIEW_CHANNEL,
  }),
}, undefined, (nothing, response) => console.log("RESPONSE", response));

reminders.memberApi({
  body: querystring.stringify({
    user_id: process.env.USER_ID,
    user_username: process.env.USERNAME,
    channel_id: process.env.PRIVATE_VIEW_CHANNEL,
  }),
}, undefined, (nothing, response) => console.log("RESPONSE", response));

reminders.rentalApi({
  body: querystring.stringify({
    user_id: process.env.USER_ID,
    user_username: process.env.USERNAME,
    channel_id: process.env.PRIVATE_VIEW_CHANNEL,
  }),
}, undefined, (nothing, response) => console.log("RESPONSE", response));
