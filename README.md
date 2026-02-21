# URI Dereferencer

Lightweight nginx Docker container for dereferencing Linked Data URIs via SPARQL DESCRIBE queries. Renders an interactive HTML view with property tables, WKT geometry on Leaflet maps, and content negotiation for RDF formats (Turtle, RDF/XML, JSON-LD). All JS libraries are bundled locally — no CDN tracking.

## Quick Start

```bash
docker-compose up -d
# or
docker build -t uri-dereferencer .
docker run -p 8080:8080 -e SPARQL_ENDPOINT=https://jena.matdata.eu/rinf/sparql uri-dereferencer
```

Then open `http://localhost:8080/{resource-uri}`.

### Configuration

| Variable | Default | Description |
|---|---|---|
| `SPARQL_ENDPOINT` | `https://jena.matdata.eu/rinf/sparql` | SPARQL endpoint URL |
| `ENTITY_NS` | `https://data.matdata.eu` | Entity namespace for local routing |

## Usage

**Production** — the URL *is* the URI:
```
https://data.matdata.eu/_netPointReferences_swi366_on_ne_348
```

**Local testing** — pass the full URI in the path:
```
http://localhost:8080/http://example.org/resource/123
```

### Content Negotiation

Click the format badges in the UI, or use `Accept` headers:

```bash
curl -H "Accept: text/turtle" http://localhost:8080/{uri}
curl -H "Accept: application/rdf+xml" http://localhost:8080/{uri}
curl -H "Accept: application/ld+json" http://localhost:8080/{uri}
```

### Geospatial

WKT geometries linked via `gsp:hasGeometry` are automatically rendered on a Leaflet map. Supports standard WKT, EWKT with SRID, and OpenGIS CRS format. Built-in EPSG definitions for 4326, 3857, 31370, 4258, 3035, 25832, 25833; others fetched from epsg.io.

## Architecture

nginx serves a client-side SPA. The browser extracts the URI from the URL path, runs `DESCRIBE` against the SPARQL endpoint, parses N-Triples with N3.js, and renders properties, geometry (betterknown + Leaflet + proj4), and related resources.

```
├── Dockerfile / docker-compose.yml / nginx.conf / entrypoint.sh
├── index.html
├── assets/
│   ├── js/          (config.js, dereferencer.js, map-viewer.js)
│   ├── css/         (dereferencer.css)
│   ├── data/        (prefixes.json)
│   └── vendor/      (bootstrap, bootstrap-icons)
└── vendor/          (n3, leaflet, proj4, betterknown)
```

## Dependencies

All libraries bundled locally:

| Library | Version | Purpose |
|---|---|---|
| N3.js | 1.17.2 | RDF parsing |
| Leaflet | 1.9.4 | Interactive maps |
| proj4 | 2.9.2 | Coordinate transforms |
| betterknown | 1.1.1 | WKT → GeoJSON |
| Bootstrap | 5.3.3 | UI framework |

## Development

```bash
# Without Docker — any HTTP server works:
python -m http.server 8080
# Edit assets/js/config.js to set SPARQL_ENDPOINT, then open http://localhost:8080/{uri}

# Rebuild Docker:
docker-compose down && docker-compose build --no-cache && docker-compose up -d
```

## License

Part of the [MatData](https://matdata.eu/) semantic-tools collection.
