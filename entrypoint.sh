#!/bin/sh
set -e

# Default values
SPARQL_ENDPOINT=${SPARQL_ENDPOINT:-https://jena.matdata.eu/rinf/sparql}
BASE_URI=${BASE_URI:-https://data.matdata.eu}

echo "Configuring SPARQL endpoint: $SPARQL_ENDPOINT"
echo "Configuring BASE URI: $BASE_URI"

# Inject configuration into JavaScript config
cat > /usr/share/nginx/html/assets/js/config.js <<EOF
// Runtime configuration - auto-generated at container startup
window.CONFIG = {
    SPARQL_ENDPOINT: '$SPARQL_ENDPOINT',
    ENTITY_NS: '$BASE_URI',
    BASE_URI: window.location.origin
};
EOF

# Replace placeholders in nginx.conf
sed -i "s|\${SPARQL_ENDPOINT}|$SPARQL_ENDPOINT|g" /etc/nginx/conf.d/default.conf
sed -i "s|\${BASE_URI}|$BASE_URI|g" /etc/nginx/conf.d/default.conf

echo "Configuration complete"
