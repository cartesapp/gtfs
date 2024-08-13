server {
    server_name serveur.cartes.app;
    root /var/www/serveur.cartes.app;


     location / {
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header Host $host;
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
	# beware, this folder needs to be readable by www-data user https://stackoverflow.com/questions/16808813/nginx-serve-static-file-and-got-403-forbidden
   location /pmtiles/ {
        alias /home/ubuntu/gtfs/data/pmtiles/;
        add_header Access-Control-Allow-Origin *;
        autoindex on;
    }


    location = /gtfs {
    return 302 /gtfs/;
    }
    location /gtfs/ {
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header Host $host;
        proxy_pass http://127.0.0.1:3001/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }


    listen 443 ssl; # managed by Certbot
    ssl_certificate /etc/letsencrypt/live/serveur.cartes.app/fullchain.pem; # managed by Certbot
    ssl_certificate_key /etc/letsencrypt/live/serveur.cartes.app/privkey.pem; # managed by Certbot
    include /etc/letsencrypt/options-ssl-nginx.conf; # managed by Certbot
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem; # managed by Certbot

}
server {
    if ($host = serveur.cartes.app) {
        return 301 https://$host$request_uri;
    } # managed by Certbot


    listen 80;
    server_name serveur.cartes.app;
    return 404; # managed by Certbot

