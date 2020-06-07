// Credits to https://medium.com/@simonrand_43344/using-aws-simple-systems-manager-and-lambda-to-replace-cron-in-an-ec2-auto-scaling-group-939d114ec9d7
//
// Trigger:
//   Subscribe to arn:aws:sns:us-east-1:806199016981:AmazonIpSpaceChanged
//   to be notified when there is an update
//
// Environment Variables:
//   CLOUDWATCH_GROUPNAME:
//   FAILURE_SNS_TOPIC:
//   INSTANCEID:
//   REGION:
//   SCRIPT_PATHANDFILENAME: /path/to/addcloudfrontip-toufw.sh

'use strict'

const AWS = require('aws-sdk')
const ssm = new AWS.SSM({region: process.env.REGION})

exports.handler = (event) => {
    try {
      runCommand(process.env.INSTANCEID)
    }
    catch(err) {
      reportFailure(err)
    }
}

const reportFailure = (failureMessage) => {
  const failureSnsTopic = process.env.FAILURE_SNS_TOPIC

  console.log('Scheduled Job failed:', failureMessage)
  
  if(failureSnsTopic) {
    reportFailureToSns(failureSnsTopic, failureMessage)
  } else {
    console.log('Warning: no failure SNS defined.')
    console.log('Scheduled Job failed:', failureMessage)
  }
}

const reportFailureToSns = (topic, message) => {
  const sns = new AWS.SNS()

  return new Promise((resolve, reject) => {
    sns.publish({
      Message: message,
      Subject: 'Scheduled Job Failed',
      TopicArn: topic
    }, (err, data) => {
      if (err) {
        reject(err)
      } else {
        resolve(data)
      }
    })
  })
}

const runCommand = (instance) => {
  ssm.sendCommand({
    DocumentName: "AWS-RunShellScript",
    CloudWatchOutputConfig : {
      CloudWatchOutputEnabled: true,
      CloudWatchLogGroupName: process.env.CLOUDWATCH_GROUPNAME
    },
    InstanceIds: [ instance ],
    TimeoutSeconds: 3600,
    Parameters: {
      "commands": [
        process.env.SCRIPT_PATHANDFILENAME
      ]
    }
  }, function(err, data) {
    if (err) {
      reportFailure(JSON.stringify(err))
    } else {
      console.log(data)
    }
  })
}
