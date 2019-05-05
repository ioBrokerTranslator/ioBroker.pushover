/**
 *
 *      ioBroker pushover Adapter
 *
 *      (c) 2014-2018 bluefox
 *
 *      MIT License
 *
 */

/* jshint -W097 */// jshint strict:false
/*jslint node: true */
'use strict';
const utils = require('@iobroker/adapter-core'); // Get common adapter utils
const Pushover = require('pushover-notifications');

const adapter  = new utils.Adapter('pushover');

adapter.on('message', obj => {
    if (obj && obj.command === 'send') {
        processMessage(obj);
    }
    processMessages();
});

adapter.on('ready', main);

let stopTimer       = null;
let pushover;
let lastMessageTime = 0;
let lastMessageText = '';

// Terminate adapter after 30 seconds idle
function stop() {
    if (stopTimer) {
        clearTimeout(stopTimer);
    }

    // Stop only if subscribe mode
    if (adapter.common && adapter.common.mode === 'subscribe') {
        stopTimer = setTimeout(() => {
            stopTimer = null;
            adapter.stop();
        }, 30000);
    }
}

function processMessage(obj) {
    if (!obj || !obj.message) return;

    // filter out double messages
    const json = JSON.stringify(obj.message);
    if (lastMessageTime && lastMessageText === JSON.stringify(obj.message) && new Date().getTime() - lastMessageTime < 1000) {
        adapter.log.debug('Filter out double message [first was for ' + (new Date().getTime() - lastMessageTime) + 'ms]: ' + json);
        return;
    }
    lastMessageTime = new Date().getTime();
    lastMessageText = json;

    if (stopTimer) clearTimeout(stopTimer);

    sendNotification(obj.message, (err, response) => {
        if (obj.callback) adapter.sendTo(obj.from, 'send', { error: err, response: response}, obj.callback);
    });

    stop();
}

function processMessages() {
    if (!adapter.getMessage) return;
    adapter.getMessage((err, obj) => {
        if (obj) {
            processMessage(obj);
            processMessages();
        }
    });
}

function main() {
    // Adapter is started only if some one writes into "system.adapter.pushover.X.messagebox" new value
    processMessages();
    stop();
}

function sendNotification(message, callback) {
    if (!message) message = {};

    if (!pushover) {
        if (adapter.config.user && adapter.config.token) {
            pushover = new Pushover({
                user:  adapter.config.user,
                token: adapter.config.token
            });
        } else {
            adapter.log.error('Cannot send notification while not configured');
        }
    }

    if (!pushover) return;

    if (typeof message !== 'object') {
        message = {message: message};
    }
    if (message.hasOwnProperty('token')) {
        pushover.token  =  message.token
    } else {
        pushover.token  = adapter.config.token
    }
    message.title     = message.title     || adapter.config.title;
    message.sound     = message.sound     || (adapter.config.sound ? adapter.config.sound : undefined);
    message.priority  = message.priority  || adapter.config.priority;
    message.url       = message.url       || adapter.config.url;
    message.url_title = message.url_title || adapter.config.url_title;
    message.device    = message.device    || adapter.config.device;
    message.message   = message.message   || '';

    // if timestamp in ms => make seconds // if greater than 2000.01.01 00:00:00
    if (message.timestamp && message.timestamp > 946681200000) {
        message.timestamp = Math.round(message.timestamp / 1000);
    }

    // mandatory parameters if priority is high (2)
    if (message.priority === 2) {
        message.retry  = parseInt(message.retry, 10)  || 60;
        message.expire = parseInt(message.expire, 10) || 3600;
    }

    adapter.log.info('Send pushover notification: ' + JSON.stringify(message));

    pushover.send(message, (err, result) => {
        if (err) {
            adapter.log.error('Cannot send notification: ' + JSON.stringify(err));
            if (callback) callback(err);
            return false;
        } else {
            if (callback) callback(null, result);
            return true;
        }
    });
}
