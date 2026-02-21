FROM nginxinc/nginx-unprivileged:alpine

# Copy nginx configuration
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copy static files
COPY assets /usr/share/nginx/html/assets
COPY vendor /usr/share/nginx/html/vendor
COPY index.html /usr/share/nginx/html/

# Make js directory writable for config injection
USER root
RUN chown -R 101:101 /usr/share/nginx/html/assets/js
USER 101

# Copy entrypoint script with execute permissions
COPY --chmod=755 entrypoint.sh /docker-entrypoint.d/40-inject-config.sh

EXPOSE 8080

# Default nginx entrypoint will run our script and start nginx
