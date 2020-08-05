###Instance Role

Policy - Managed - AmazonSSMManagedInstanceCore

###Security Groups

To NAT Instance INBOUND, add Private subnet CIDR 

###Routes & Associations

To Private subnet routes, add NAT Instance as the target (Destination 0.0.0.0/0)

Add private subnet to subnet association to route the traffic 

###Instance Userdata

```
######### Install & Update
sudo yum -y update
sudo yum -y upgrade
sudo yum -y install jq
sudo yum -y install ipset
sudo yum install iptables-services -y
sudo yum install ipset-service -y
sudo systemctl enable iptables
sudo systemctl start iptables

######### Read SSM Parameters
PRIVATESUBNETCIDR=$(aws ssm get-parameter --name "nat-privatesubnet" --region="eu-west-1"  | jq -r ".Parameter.Value")
EMAILSERVERIP=$(aws ssm get-parameter --name "nat-emailserverprivateip" --region="eu-west-1"  | jq -r ".Parameter.Value")

######### Remove Old rules
sudo iptables -F
sudo iptables -X

######### Create IPSet + add it to iptables
sudo ipset create blocklist hash:ip hashsize 4096
sudo ipset create blocklist_new hash:ip hashsize 4096
sudo iptables -I INPUT   -m set --match-set blocklist src -j DROP
sudo iptables -I FORWARD -m set --match-set blocklist src -j DROP

######### Create blocklist-refresh.sh script
sudo cat >~/blocklist-refresh.sh <<EOF
#!/bin/bash
 
BLOCKLIST_FILE="/var/local/BlockListIP.txt"
BLOCKLIST_FILE_TMP="/var/local/BlockListIP.tmp"
 
BLOCKLISTS=(
"http://danger.rulez.sk/projects/bruteforceblocker/blist.php"
"http://cinsscore.com/list/ci-badguys.txt"
"https://lists.blocklist.de/lists/all.txt"
)
 
for liste in "\${BLOCKLISTS[@]}"
do
    LISTE_TMP=\$(curl "\$liste")
    echo "\$LISTE_TMP" | grep -Po '(?:\d{1,3}\.){3}\d{1,3}(?:/\d{1,2})?' >> \$BLOCKLIST_FILE_TMP
done
 
sort -n -t . -k 1,1 -k 2,2 -k 3,3 -k 4,4 \$BLOCKLIST_FILE_TMP | uniq > \$BLOCKLIST_FILE
rm \$BLOCKLIST_FILE_TMP
 
# Flush de la table blocklist pour éviter les doublons.
ipset flush blocklist_new  > /dev/null
 
while read ip
do
    ipset add blocklist_new \$ip
done < \$BLOCKLIST_FILE

ipset swap blocklist blocklist_new

EOF

######### Move blocklist-refresh.sh to /usr/local/bin
sudo mv ~/blocklist-refresh.sh /usr/local/bin/blocklist-refresh.sh
sudo chmod +x /usr/local/bin/blocklist-refresh.sh
sudo /usr/local/bin/blocklist-refresh.sh

######### Update ipset-service configuration
sudo cat >~/ipset-config <<EOF
IPSET_SAVE_ON_STOP="yes"
EOF
sudo mv ~/ipset-config /etc/sysconfig/ipset-config

######### Add CRON Job
sudo crontab -l > ~/jobs.txt
sudo echo "0 * * * * sudo /usr/local/bin/blocklist-refresh.sh" >> ~/jobs.txt
sudo crontab ~/jobs.txt
sudo rm ~/jobs.txt

######### Enable IP Forwarding
cp /etc/sysctl.conf ~/sysctl.conf
echo "net.ipv4.ip_forward = 1" >> ~/sysctl.conf
sudo mv -f ~/sysctl.conf /etc/sysctl.conf
sudo chown root:root /etc/sysctl.conf
sudo sysctl -p

######### Adjust iptables with ipset blocklist
sudo iptables -I INPUT   -m set --match-set blocklist src -j DROP
sudo iptables -I FORWARD -m set --match-set blocklist src -j DROP

######### Adjust iptables with Private network CIDR 
sudo iptables -t nat -A POSTROUTING -o eth0 -s $PRIVATESUBNETCIDR -j MASQUERADE

######### Enable Port NAT
sudo iptables -t nat -A PREROUTING -p tcp --dport 25 -j DNAT --to-destination $EMAILSERVERIP:25
sudo iptables -t nat -A PREROUTING -p tcp --dport 3389 -j DNAT --to-destination $EMAILSERVERIP:3389

######### Save iptables & ipset rules
sudo service iptables save
sudo service ipset save
sudo systemctl start ipset
sudo systemctl enable ipset
```

Credits 
- https://www.fanjoe.be/?p=3233
- https://medium.com/@rakeshkanagaraj1990/aws-nat-instance-bb0911ba19d5
