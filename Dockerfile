FROM --platform=$BUILDPLATFORM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:1.29-alpine
ARG VERSION=dev
LABEL org.opencontainers.image.title="madar-web" \
      org.opencontainers.image.version="$VERSION"

# Defaults to the incoming Host so Frappe resolves the site from the request; set it to pin one site.
ENV ERPNEXT_UPSTREAM=http://frontend:8080 \
    NGINX_ENTRYPOINT_LOCAL_RESOLVERS=1 \
    TRUST_FORWARDED_PROTO=0 \
    ERPNEXT_SITE_HOST='$host' \
    ASSISTANT_UPSTREAM='' \
    MADAR_ERPNEXT_URL=''

COPY docker/nginx.conf.template /etc/nginx/templates/default.conf.template
COPY docker/security-headers.conf /etc/nginx/snippets/security-headers.conf
COPY docker/16-madar-env.envsh /docker-entrypoint.d/16-madar-env.envsh
COPY docker/40-madar-config.sh /docker-entrypoint.d/40-madar-config.sh
COPY --from=build /app/dist/madar/browser /usr/share/nginx/html
RUN chmod +x /docker-entrypoint.d/16-madar-env.envsh /docker-entrypoint.d/40-madar-config.sh && echo "$VERSION" > /usr/share/nginx/html/version.txt

EXPOSE 80
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://127.0.0.1/healthz || exit 1
