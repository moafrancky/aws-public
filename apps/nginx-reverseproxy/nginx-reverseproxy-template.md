###Parameter Store

- nginx-letsencrypt-domain
- nginx-letsencrypt-email
- nginx-letsencrypt-nginx-dockerimage	

###Instance Role

Policy - Managed - AmazonSSMManagedInstanceCore

Policy - Managed - AmazonEC2ContainerRegistryReadOnly 

###Security Groups

INBOUND

- SSH Access (restricted to some IPs)
- HTTP + HTTPS

###Instance Userdata

```
#!/bin/bash

MESSAGESTART="!!Userdata!! "

######### Wait some time to let instance initialize (prevent memory error on small instances)
echo $MESSAGESTART "waiting 20 seconds"
sleep 20s

######### Install & Update
echo $MESSAGESTART "updating instance"
yum -y update
yum -y upgrade
yum -y install jq

echo $MESSAGESTART "installing docker & docker-compose"
amazon-linux-extras install -y docker
systemctl enable docker
service docker start
curl -L https://github.com/docker/compose/releases/download/1.26.2/docker-compose-Linux-x86_64 -o /usr/local/bin/docker-compose
chmod +x /usr/local/bin/docker-compose
ln -s /usr/local/bin/docker-compose /usr/bin/docker-compose

echo $MESSAGESTART "creating configuration files"
mkdir /etc/mydockers
mkdir /etc/mydockers/nginx
mkdir /etc/mydockers/nginx/data
mkdir /etc/mydockers/nginx/data/nginx

## we use 'EOF' to prevent $ substitution
cat >/etc/mydockers/nginx/docker-compose.yml <<'EOF'
version: '2'

services:
  nginx:
    image: nginximage
    restart: unless-stopped
    volumes:
      - ./data/nginx:/etc/nginx/conf.d
      - ./data/certbot/conf:/etc/letsencrypt
      - ./data/certbot/www:/var/www/certbot
    ports:
      - "80:80"
      - "443:443"
    command: "/bin/sh -c 'while :; do sleep 6h & wait $${!}; nginx -s reload; done & nginx -g \"daemon off;\"'"
    networks:
      - nginx_network
    mem_limit: 128M

  certbot:
    image: certbot/certbot
    restart: unless-stopped
    volumes:
      - ./data/certbot/conf:/etc/letsencrypt
      - ./data/certbot/www:/var/www/certbot
    entrypoint: "/bin/sh -c 'trap exit TERM; while :; do certbot renew; sleep 12h & wait $${!}; done;'"
    networks:
      - nginx_network
    mem_limit: 128M

networks:
  nginx_network:
    external: true
EOF

NGINXIMAGE=$(aws ssm get-parameter --name "nginx-letsencrypt-nginx-dockerimage" --region="eu-west-1"  | jq -r ".Parameter.Value")
NGINXIMAGE="${NGINXIMAGE////\/}"
sudo sed -i "s/nginximage/$NGINXIMAGE/g" "/etc/mydockers/nginx/docker-compose.yml"

## we use 'EOF' to prevent $ substitution
cat >/etc/mydockers/nginx/init-letsencrypt.sh <<'EOF'
#!/bin/bash

if ! [ -x "$(command -v docker-compose)" ]; then
  echo 'Error: docker-compose is not installed.' >&2
  exit 1
fi

domains=( $(aws ssm get-parameter --name "nginx-letsencrypt-domain" --region="eu-west-1"  | jq -r ".Parameter.Value") )
rsa_key_size=4096
data_path="./data/certbot"
email=$(aws ssm get-parameter --name "nginx-letsencrypt-email" --region="eu-west-1"  | jq -r ".Parameter.Value")
staging=0 # Set to 1 if you're testing your setup to avoid hitting request limits

if [ -d "$data_path" ]; then
  read -p "Existing data found for $domains. Continue and replace existing certificate? (y/N) " decision
  if [ "$decision" != "Y" ] && [ "$decision" != "y" ]; then
    exit
  fi
fi


if [ ! -e "$data_path/conf/options-ssl-nginx.conf" ] || [ ! -e "$data_path/conf/ssl-dhparams.pem" ]; then
  echo "### Downloading recommended TLS parameters ..."
  mkdir -p "$data_path/conf"
  curl -s https://raw.githubusercontent.com/certbot/certbot/master/certbot-nginx/certbot_nginx/_internal/tls_configs/options-ssl-nginx.conf > "$data_path/conf/options-ssl-nginx.conf"
  curl -s https://raw.githubusercontent.com/certbot/certbot/master/certbot/certbot/ssl-dhparams.pem > "$data_path/conf/ssl-dhparams.pem"
  echo
fi

echo "### Creating dummy certificate for $domains ..."
path="/etc/letsencrypt/live/$domains"
mkdir -p "$data_path/conf/live/$domains"
docker-compose run --rm --entrypoint "\
  openssl req -x509 -nodes -newkey rsa:1024 -days 1\
    -keyout '$path/privkey.pem' \
    -out '$path/fullchain.pem' \
    -subj '/CN=localhost'" certbot
echo


echo "### Starting nginx ..."
docker-compose up --force-recreate -d nginx
echo

echo "### Deleting dummy certificate for $domains ..."
docker-compose run --rm --entrypoint "\
  rm -Rf /etc/letsencrypt/live/$domains && \
  rm -Rf /etc/letsencrypt/archive/$domains && \
  rm -Rf /etc/letsencrypt/renewal/$domains.conf" certbot
echo


echo "### Requesting Let's Encrypt certificate for $domains ..."
#Join $domains to -d args
domain_args=""
for domain in "${domains[@]}"; do
  domain_args="$domain_args -d $domain"
done

# Select appropriate email arg
case "$email" in
  "") email_arg="--register-unsafely-without-email" ;;
  *) email_arg="--email $email" ;;
esac

# Enable staging mode if needed
if [ $staging != "0" ]; then staging_arg="--staging"; fi

docker-compose run --rm --entrypoint "\
  certbot certonly --webroot -w /var/www/certbot \
    $staging_arg \
    $email_arg \
    $domain_args \
    --rsa-key-size $rsa_key_size \
    --agree-tos \
    --force-renewal" certbot
echo
EOF

cat >/etc/mydockers/nginx/data/nginx/app.conf <<EOF
server {
    listen 80;

    server_name $(aws ssm get-parameter --name "nginx-letsencrypt-domain" --region="eu-west-1"  | jq -r ".Parameter.Value");
    server_tokens off;

    location /.well-known/acme-challenge/ {
        root /var/www/certbot;
    }

    location / {
        return 301 https://\$host\$request_uri;
    }
}

server {
    listen 443 ssl;

    server_name $(aws ssm get-parameter --name "nginx-letsencrypt-domain" --region="eu-west-1"  | jq -r ".Parameter.Value");
    server_tokens off;

    ssl_certificate /etc/letsencrypt/live/$(aws ssm get-parameter --name "nginx-letsencrypt-domain" --region="eu-west-1"  | jq -r ".Parameter.Value")/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/$(aws ssm get-parameter --name "nginx-letsencrypt-domain" --region="eu-west-1"  | jq -r ".Parameter.Value")/privkey.pem;
    include /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;

    location / {
        return 404;
    }
}
EOF

chmod +x /etc/mydockers/nginx/init-letsencrypt.sh

echo $MESSAGESTART "logging in to ECR"
$(aws ecr get-login --no-include-email --region eu-west-1)

echo $MESSAGESTART "creating docker network + pulling images"
docker network create nginx_network
docker pull certbot/certbot
docker pull $(aws ssm get-parameter --name "nginx-letsencrypt-nginx-dockerimage" --region="eu-west-1"  | jq -r ".Parameter.Value")

# To finalize
#cd /etc/mydockers/nginx
#sudo ./init-letsencrypt.sh
#sudo docker-compose down 
#sudo docker-compose up -d
```

## To Finalize

Connect with SSH

```
cd /etc/mydockers/nginx
sudo ./init-letsencrypt.sh
sudo docker-compose down 
sudo docker-compose up -d
```