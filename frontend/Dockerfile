FROM nginx:1.27-alpine

RUN apk add --no-cache curl

COPY nginx.conf.template /etc/nginx/templates/nginx.conf.template
COPY index.html /usr/share/nginx/html/index.html.template
COPY css /usr/share/nginx/html/css
COPY js /usr/share/nginx/html/js
COPY docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

ENV COMPANY_NAME=EasyInsure
ENV BACKEND_UPSTREAM=backend:8000

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
    CMD curl -f http://localhost/ || exit 1

ENTRYPOINT ["/docker-entrypoint.sh"]
CMD ["nginx", "-g", "daemon off;"]
