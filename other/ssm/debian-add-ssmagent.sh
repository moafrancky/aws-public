#!/bin/bash

# Script to install a SSM agent on a Debian OS

wget https://s3.eu-west-1.amazonaws.com/amazon-ssm-eu-west-1/latest/debian_amd64/amazon-ssm-agent.deb
sudo dpkg -i amazon-ssm-agent.deb
sudo systemctl enable amazon-ssm-agent
sudo amazon-ssm-agent -register -code "xxx" -id "yyy" -region "eu-west-1"
sudo systemctl enable amazon-ssm-agent