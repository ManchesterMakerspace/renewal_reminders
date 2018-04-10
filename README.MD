# Renewal reminder scheduler

This is a cron job to remind makerspace members that they might need to renew soon

Runs once everyday

### Makerspace Contributors

Note: Changes deploy on push to master branch

Requires installing/running mongod, node, and npm. Can also require a slack webhook URI as that is its intended target output. Though without it things can be tested by falling back on logs

These are instructions to test membership reminders locally. For Manchester Makerspace members reach out on the slack #access_control channel if you are interested in working with real data. Running Jitploy with the proper key can decrypt the configuration and run the reminders in production or testing states. The goal with using Jitploy is reproducibility and ease of deployment.

Edit the following command with the right environment, configuration key, and access token to start things up. Using Jitploy without options will start things in sample/demo mode as shown below. Sample configuration exist in /jitploy/sample.yml. The sample assumes a local mongo server is running.

    npm install setup && jitploy membership.js

or

    npm install setup && jitploy rental.js
