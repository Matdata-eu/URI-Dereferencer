# Deployment Guide

## Overview

This URI dereferencer supports two deployment modes that work seamlessly together:

1. **Production Mode**: Deployed at `https://data.matdata.eu/` where the URL **is** the URI
2. **Testing Mode**: Local development where arbitrary URIs can be passed in the path

## Production Deployment

### Server Configuration

Deploy the container at `https://data.matdata.eu/` using a reverse proxy (nginx, Apache, etc.).

**Example nginx reverse proxy configuration:**

```nginx
server {
    listen 80;
    listen [::]:80;
    server_name data.matdata.eu;

    # Redirect to HTTPS
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name data.matdata.eu;

    # SSL certificates
    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;

    # Proxy to Docker container
    location / {
        proxy_pass http://localhost:8080;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

**Example docker-compose.yml for production:**

```yaml
version: '3.8'

services:
  uri-dereferencer:
    image: uri-dereferencer:latest
    container_name: uri-deref-prod
    restart: unless-stopped
    ports:
      - "127.0.0.1:8080:8080"  # Only expose to localhost
    environment:
      - SPARQL_ENDPOINT=https://jena.matdata.eu/rinf/sparql
    networks:
      - backend

networks:
  backend:
    driver: bridge
```

### Usage Examples

Once deployed, resources are accessed using their canonical URIs:

```
https://data.matdata.eu/_netPointReferences_swi366_on_ne_348
https://data.matdata.eu/stations/Brussels_North
https://data.matdata.eu/tracks/Track_001
```

**How it works:**
- User requests: `https://data.matdata.eu/_netPointReferences_swi366_on_ne_348`
- JavaScript extracts path: `_netPointReferences_swi366_on_ne_348`
- Constructs URI: `https://data.matdata.eu/_netPointReferences_swi366_on_ne_348`
- Queries SPARQL: `DESCRIBE <https://data.matdata.eu/_netPointReferences_swi366_on_ne_348>`

## Local Testing Mode

### Docker Setup

For local testing with arbitrary external URIs:

```bash
docker-compose up -d
```

Or using Docker directly:

```bash
docker run -d -p 8080:8080 \
  -e SPARQL_ENDPOINT=https://jena.matdata.eu/rinf/sparql \
  --name uri-deref-test \
  uri-dereferencer
```

### Testing Production URIs Locally

You can test production URIs locally by passing them in the path:

```
http://localhost:8080/https://data.matdata.eu/_netPointReferences_swi366_on_ne_348
```

**How it works:**
- User requests: `http://localhost:8080/https://data.matdata.eu/_netPointReferences_swi366_on_ne_348`
- JavaScript extracts path: `https://data.matdata.eu/_netPointReferences_swi366_on_ne_348`
- Detects `https://` prefix and uses URI directly
- Queries SPARQL: `DESCRIBE <https://data.matdata.eu/_netPointReferences_swi366_on_ne_348>`

### Testing External URIs

You can also test URIs from other domains:

```
http://localhost:8080/http://example.org/resource/123
http://localhost:8080/https://dbpedia.org/resource/Brussels
http://localhost:8080/http://data.europa.eu/some/resource
```

## URI Extraction Logic

The application uses intelligent URI detection in `dereferencer.js`:

```javascript
extractURIFromPath() {
    const path = window.location.pathname;
    let uri = path.substring(1); // Remove leading /
    
    // Testing mode: Full URI in path
    if (uri.startsWith('http://') || uri.startsWith('https://')) {
        return decodeURIComponent(uri);
    }
    
    // Production mode: Construct from BASE_URI + path
    return CONFIG.BASE_URI + '/' + uri;
}
```

Where `CONFIG.BASE_URI = window.location.origin`:
- Production: `https://data.matdata.eu`
- Local: `http://localhost:8080`

## Deployment Checklist

### Pre-Deployment

- [ ] Update SPARQL endpoint in docker-compose.yml
- [ ] Test locally with production URIs
- [ ] Verify CORS headers if endpoint has restrictions
- [ ] Check SSL certificates for HTTPS
- [ ] Configure reverse proxy (nginx/Apache)

### Deployment

- [ ] Build Docker image: `docker build -t uri-dereferencer .`
- [ ] Tag for production: `docker tag uri-dereferencer:latest uri-dereferencer:prod`
- [ ] Deploy container with docker-compose
- [ ] Verify health endpoint: `curl https://data.matdata.eu/health`
- [ ] Test sample URI: `https://data.matdata.eu/_netPointReferences_swi366_on_ne_348`

### Post-Deployment

- [ ] Monitor container logs: `docker logs -f uri-deref-prod`
- [ ] Test content negotiation with curl
- [ ] Verify geometry visualization works
- [ ] Check "See Also" section functionality
- [ ] Test RDF format downloads (Turtle, RDF/XML, JSON-LD)

## Testing Both Modes

### Test Production Mode Locally

Simulate production behavior by accessing local URIs:

```bash
# Start container
docker-compose up -d

# Test local resource (simulates production pattern)
curl http://localhost:8080/test/resource/1

# This will query: DESCRIBE <http://localhost:8080/test/resource/1>
```

### Test with Production Data Locally

Test actual production URIs before deployment:

```bash
# Test production URI locally
curl http://localhost:8080/https://data.matdata.eu/_netPointReferences_swi366_on_ne_348

# This will query: DESCRIBE <https://data.matdata.eu/_netPointReferences_swi366_on_ne_348>
```

## Content Negotiation

The application supports content negotiation for RDF formats:

```bash
# Get Turtle
curl -H "Accept: text/turtle" \
  https://data.matdata.eu/_netPointReferences_swi366_on_ne_348

# Get RDF/XML
curl -H "Accept: application/rdf+xml" \
  https://data.matdata.eu/_netPointReferences_swi366_on_ne_348

# Get JSON-LD
curl -H "Accept: application/ld+json" \
  https://data.matdata.eu/_netPointReferences_swi366_on_ne_348

# Get HTML (default)
curl -H "Accept: text/html" \
  https://data.matdata.eu/_netPointReferences_swi366_on_ne_348
```

## Monitoring

### Health Check

```bash
curl https://data.matdata.eu/health
# Expected: OK
```

### Container Logs

```bash
docker logs -f uri-deref-prod
```

### SPARQL Endpoint Status

Verify the SPARQL endpoint is accessible:

```bash
curl -I https://jena.matdata.eu/rinf/sparql
```

## Troubleshooting

### Issue: 404 Not Found

**Cause:** Reverse proxy not configured correctly

**Solution:** Check nginx/Apache configuration and ensure proxy_pass is set correctly

### Issue: Mixed Content Warning

**Cause:** HTTPS site loading HTTP resources

**Solution:** Ensure all assets use relative paths (already configured)

### Issue: CORS Errors

**Cause:** SPARQL endpoint blocking cross-origin requests

**Solution:** Verify CORS headers in nginx.conf:
```nginx
add_header Access-Control-Allow-Origin * always;
```

### Issue: Empty Results

**Cause:** Resource doesn't exist in triplestore

**Solution:** Verify URI exists in SPARQL endpoint:
```bash
curl -G --data-urlencode "query=ASK { <URI> ?p ?o }" \
  https://jena.matdata.eu/rinf/sparql
```

## Performance Optimization

### Caching

Add caching headers in reverse proxy:

```nginx
location ~* \.(js|css|png|jpg|jpeg|gif|ico|woff|woff2)$ {
    expires 1y;
    add_header Cache-Control "public, immutable";
}
```

### Compression

Enable gzip in reverse proxy:

```nginx
gzip on;
gzip_types text/plain text/css application/json application/javascript text/xml application/xml;
```

### CDN (Optional)

Consider using a CDN for static assets to reduce load times globally.

## Security Considerations

1. **HTTPS Only**: Always deploy with SSL/TLS
2. **Rate Limiting**: Configure rate limits in reverse proxy
3. **Input Validation**: URIs are validated in JavaScript (no user input to backend)
4. **CORS**: Configured for SPARQL endpoint access only
5. **Container Security**: Uses nginxinc/nginx-unprivileged (non-root)

## Backup and Disaster Recovery

The application is stateless - all data comes from the SPARQL endpoint.

**Key components to backup:**
- Docker image: `uri-dereferencer:prod`
- docker-compose.yml configuration
- Reverse proxy configuration
- SSL certificates

## Scaling

For high-traffic deployments:

1. **Horizontal Scaling**: Run multiple containers behind a load balancer
2. **Docker Swarm/Kubernetes**: Orchestrate multiple replicas
3. **SPARQL Endpoint**: Ensure endpoint can handle increased query load

Example with Docker Swarm:

```yaml
version: '3.8'

services:
  uri-dereferencer:
    image: uri-dereferencer:prod
    deploy:
      replicas: 3
      update_config:
        parallelism: 1
        delay: 10s
      restart_policy:
        condition: on-failure
    ports:
      - "8080:8080"
    environment:
      - SPARQL_ENDPOINT=https://jena.matdata.eu/rinf/sparql
```

## Support

For issues or questions:
- GitHub Issues: [semantic-tools repository]
- Email: support@matdata.eu
- Website: https://matdata.eu/
