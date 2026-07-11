#!/bin/sh
set -e

envsubst '${COMPANY_NAME}' < /usr/share/nginx/html/index.html.template > /usr/share/nginx/html/index.html
envsubst '${BACKEND_UPSTREAM}' < /etc/nginx/templates/nginx.conf.template > /etc/nginx/conf.d/default.conf

exec "$@"
