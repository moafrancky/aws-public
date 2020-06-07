#!/bin/bash

# script to whitelist Cloudfront IPs and prevent Cloud WAF Bypass
# Don't forget to subscribe to AWS Public IPs Changes https://aws.amazon.com/blogs/aws/subscribe-to-aws-public-ip-address-changes-via-amazon-sns/

sudo apt install -y jq

# https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/LocationsOfEdgeServers.html
curl -L http://d7uri8nf7uskq.cloudfront.net/tools/list-cloudfront-ips --output cloudfront.json

jq -r ".CLOUDFRONT_GLOBAL_IP_LIST" cloudfront.json > iplist.txt
jq -r ".CLOUDFRONT_REGIONAL_EDGE_IP_LIST" cloudfront.json >> iplist.txt

echo "y" | sudo ufw reset
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow ssh
while read p; do if [ ${#p} -ge 5 ]; then $(echo "sudo ufw allow proto tcp from ${p//[,\"]/} to any port 80,443"); fi done < iplist.txt
sudo ufw reload
echo "y" | sudo ufw enable
