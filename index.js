'use strict';

const zlib = require('zlib');

console.log('Loading function');

const https = require('https');
const url = require('url');
const slack_url = process.env.SLACK_URL;
const slack_req_opts = url.parse(slack_url);
slack_req_opts.method = 'POST';
slack_req_opts.headers = {
    'Content-Type': 'application/json'
};

exports.handler = function(event, context, callback) {
    (event.Records || []).forEach(function(rec) {
        if (rec.Sns) {
            var req = https.request(slack_req_opts, function(res) {
                if (res.statusCode === 200) {
                    context.succeed('posted to slack');
                } else {
                    context.fail('status code: ' + res.statusCode);
                }
            });

            req.on('error', function(e) {
                console.log('problem with request: ' + e.message);
                context.fail(e.message);
            });

            var message = JSON.parse(rec.Sns.Message);
            var obj;

            if (message.AlarmName) {
                var status = message.NewStateValue;
                var color;
                if (status === "ALARM") {
                    status = ":exclamation: " + status;
                    color = "#FF0000";
                }
                if (status === "OK") {
                    status = ":+1: " + status;
                    color = "#7CD197";
                }
                var str = "*" +
                    status +
                    ": " +
                    message.AlarmDescription +
                    "*";

                obj = {
                    text: str,
                    username: "CloudWatch",
                    attachments: [{
                        fallback: message,
                        color: color,
                        fields: [{
                            title: "Alarm",
                            value: message.NewStateReason,
                            short: true
                        }, {
                            title: "Status",
                            value: message.NewStateValue,
                            short: true
                        }]
                    }]
                }
            } else if (message.AutoScalingGroupName) {
                switch (message.Event) {
                    case "autoscaling:TEST_NOTIFICATION":
                        obj = {
                            username: "EC2 Autoscaling",
                            attachments: [{
                                fallback: message,
                                pretext: "Test notification",
                                fields: [{
                                    title: "AutoScalingGroupName",
                                    value: message.AutoScalingGroupName
                                }, {
                                    title: "RequestId",
                                    value: message.RequestId
                                }, {
                                    title: "AutoScalingGroupARN",
                                    value: message.AutoScalingGroupARN
                                }, {
                                    title: "Time",
                                    value: message.Time
                                }]
                            }]
                        }
                        break;
                    case "autoscaling:EC2_INSTANCE_LAUNCH":
                        obj = {
                            username: "EC2 Autoscaling",
                            attachments: [{
                                failback: message,
                                pretext: "Launching a new instance",
                                color: "#7CD197",
                                fields: [{
                                    title: "AutoScalingGroupName",
                                    value: message.AutoScalingGroupName
                                }, {
                                    title: "Description",
                                    value: message.Description
                                }]
                            }]
                        }
                        break;
                    case "autoscaling:EC2_INSTANCE_TERMINATE":
                        obj = {
                            username: "EC2 Autoscaling",
                            attachments: [{
                                    failback: message,
                                    pretext: "Terminating instance",
                                    color: "#F35A00",
                                    fields: [{
                                        title: "AutoScalingGroupName",
                                        value: message.AutoScalingGroupName
                                    }, {
                                        title: "Description",
                                        value: message.Description
                                    }]
                                }

                            ]
                        }
                        break;
                    default:
                        obj = {
                            username: "EC2 Autoscaling",
                            attachments: [{
                                failback: message,
                                pretext: "Caution!",
                                color: "#FF0000",
                                fields: [{
                                    title: "AutoScalingGroupName",
                                    value: message.AutoScalingGroupName
                                }, {
                                    title: "Description",
                                    value: message.Description
                                }]
                            }]
                        }
                        break;
                }
            } else {

            }

            req.write(JSON.stringify(obj));

            req.end();
        }

    });
    if (event.awslogs.data) {
        const payload = Buffer.from(event.awslogs.data, 'base64');
        zlib.gunzip(payload, (err, res) => {

        if (err) {
            return callback(err);
        }

        const parsed = JSON.parse(res.toString('utf8'));
        const sendMessageLength = parsed.logEvents.length;
        var message = JSON.stringify(parsed);
        console.log('Decoded payload:', message);
        console.log(`Successfully processed ${parsed.logEvents.length} log events.`);
        callback(null, `Successfully processed ${parsed.logEvents.length} log events.`);

        message = JSON.parse(message);

        var color = "#FF0000";

        // Notification for each logEvents.
        for (var i in message.logEvents ) {
            var fields = [{
                title: "logGroup",
                value: message.logGroup
            }, {
                title: "logStream",
                value: message.logStream
            }];

            var req = https.request(slack_req_opts, function(response) {
                if (response.statusCode === 200) {
                    context.succeed('posted to slack');
                } else {
                    context.fail('status code: ' + response.statusCode);
                }
            });

            req.on('error', function(e) {
                console.log('problem with request: ' + e.message);
                context.fail(e.message);
            });

            var sendMessage = message.logEvents[i].message;
            console.log("sendMessage: " + sendMessage);

            if (isJSON(sendMessage)) {
                sendMessage = JSON.parse(sendMessage);
                Object.keys(sendMessage).forEach(function (key) {
                    console.log(key + ":" + sendMessage[key]);
                    if (sendMessage[key]) {
                        fields.push({
                            title: key,
                            value: sendMessage[key]
                        });
                    }
                });
            } else {
                fields.push({
                    title: "message",
                    value: JSON.stringify(sendMessage, null, '\t')
                });
            }

            var obj = {
                username: "CloudWatch logs",
                attachments: [{
                    fallback: message,
                    color: color,
                    fields: fields
                }]
            }

            console.log(obj);

            req.write(JSON.stringify(obj));
            req.end();
        }

    });
    }

};
