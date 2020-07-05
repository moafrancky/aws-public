# Installation of SSM Agent on a LightSail Wordpress instance 

Go to AWS System Manager / Instances & Nodes / Hybrid Activation / Create Activation, write down
 activation-code and activation-id


Configure amazon-ssm-agent, open ssh access

```
sudo snap stop amazon-ssm-agent
sudo /snap/amazon-ssm-agent/current/amazon-ssm-agent -register -code "xxx" -id "xxx" -region "eu-west-1"
sudo snap start amazon-ssm-agent
```
