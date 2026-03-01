/**
 * Map Viewer - WKT Geometry Visualization
 * Uses Leaflet.js and betterknown for WKT parsing
 * Supports EWKT format with SRID and auto-fetches EPSG definitions
 */

import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import proj4 from 'proj4'
import { wktToGeoJSON } from 'betterknown'

let map = null;
let geoJsonLayer = null;

/**
 * Initialize Leaflet map and display WKT geometry
 */
function initializeMap(wktLiteral) {
    try {
        // Parse WKT to GeoJSON
        const { geojson, srid } = parseWKT(wktLiteral);

        if (!geojson) {
            console.error('Failed to parse WKT');
            return;
        }

        // Initialize map if not already done
        if (!map) {
            map = L.map('map-container').setView([50.8503, 4.3517], 13); // Default: Brussels

            // Add OpenStreetMap tiles
            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
                maxZoom: 19
            }).addTo(map);
        }

        // Handle coordinate transformation if SRID is specified
        if (srid && srid !== 4326) {
            transformCoordinates(geojson, srid);
        }

        // Add GeoJSON to map
        addGeoJSONToMap(geojson);

        // Fit map bounds to geometry
        if (geoJsonLayer) {
            map.fitBounds(geoJsonLayer.getBounds(), {
                padding: [50, 50],
                maxZoom: 16
            });
        }

    } catch (error) {
        console.error('Error initializing map:', error);
    }
}

/**
 * Parse WKT literal (supports EWKT format with SRID)
 * Returns { geojson, srid }
 */
function parseWKT(wktLiteral) {
    let wkt = wktLiteral.trim();
    let srid = null;

    // Check for EWKT format: SRID=4326;POINT(...)
    const ewktMatch = wkt.match(/^SRID=(\d+);(.+)$/i);
    if (ewktMatch) {
        srid = parseInt(ewktMatch[1]);
        wkt = ewktMatch[2];
    }

    // Check for OpenGIS format: <http://www.opengis.net/def/crs/EPSG/0/4326> POINT(...)
    const ogcMatch = wkt.match(/^<http:\/\/www\.opengis\.net\/def\/crs\/EPSG\/0\/(\d+)>\s+(.+)$/i);
    if (ogcMatch) {
        srid = parseInt(ogcMatch[1]);
        wkt = ogcMatch[2];
    }

    // Parse WKT using betterknown
    const geojson = wktToGeoJSON(wkt);

    return { geojson, srid };
}

/**
 * Transform coordinates using proj4
 */
function transformCoordinates(geojson, sourceSRID) {
    // Define common projections
    const commonProjections = {
        4326: '+proj=longlat +datum=WGS84 +no_defs', // WGS84
        3857: '+proj=merc +a=6378137 +b=6378137 +lat_ts=0.0 +lon_0=0.0 +x_0=0.0 +y_0=0 +k=1.0 +units=m +nadgrids=@null +wktext +no_defs', // Web Mercator
        31370: '+proj=lcc +lat_1=51.16666723333333 +lat_2=49.8333339 +lat_0=90 +lon_0=4.367486666666666 +x_0=150000.013 +y_0=5400088.438 +ellps=intl +towgs84=-106.869,52.2978,-103.724,0.3366,-0.457,1.8422,-1.2747 +units=m +no_defs', // Belgian Lambert 72
        4258: '+proj=longlat +ellps=GRS80 +no_defs', // ETRS89
        3035: '+proj=laea +lat_0=52 +lon_0=10 +x_0=4321000 +y_0=3210000 +ellps=GRS80 +units=m +no_defs', // ETRS89-LAEA
        25832: '+proj=utm +zone=32 +ellps=GRS80 +units=m +no_defs', // ETRS89 / UTM zone 32N
        25833: '+proj=utm +zone=33 +ellps=GRS80 +units=m +no_defs' // ETRS89 / UTM zone 33N
    };

    // Get source projection
    let sourceProj = commonProjections[sourceSRID];

    if (!sourceProj) {
        // Try to fetch from epsg.io
        console.log(`Fetching EPSG:${sourceSRID} definition from epsg.io...`);
        fetch(`https://epsg.io/${sourceSRID}.proj4`)
            .then(response => response.text())
            .then(proj4def => {
                proj4.defs(`EPSG:${sourceSRID}`, proj4def);
                transformGeoJSON(geojson, `EPSG:${sourceSRID}`, 'EPSG:4326');
            })
            .catch(error => {
                console.error(`Failed to fetch EPSG:${sourceSRID}:`, error);
            });
        return;
    }

    // Define projections
    proj4.defs(`EPSG:${sourceSRID}`, sourceProj);
    proj4.defs('EPSG:4326', commonProjections[4326]);

    // Transform
    transformGeoJSON(geojson, `EPSG:${sourceSRID}`, 'EPSG:4326');
}

/**
 * Transform GeoJSON coordinates
 */
function transformGeoJSON(geojson, fromProj, toProj) {
    if (!geojson || !geojson.coordinates) {
        return;
    }

    const transform = proj4(fromProj, toProj);

    function transformCoords(coords) {
        if (typeof coords[0] === 'number') {
            // Single coordinate pair
            return transform.forward(coords);
        } else {
            // Array of coordinates
            return coords.map(transformCoords);
        }
    }

    geojson.coordinates = transformCoords(geojson.coordinates);
}

/**
 * Add GeoJSON to map with styling
 */
function addGeoJSONToMap(geojson) {
    // Remove existing layer
    if (geoJsonLayer) {
        map.removeLayer(geoJsonLayer);
    }

    // Wrap bare geometry as a GeoJSON Feature (Leaflet passes raw geometry
    // to onEachFeature without a .geometry wrapper)
    const featureData = (geojson.type === 'Feature' || geojson.type === 'FeatureCollection')
        ? geojson
        : { type: 'Feature', properties: {}, geometry: geojson };

    // Style function
    const style = {
        color: '#0d6efd',
        weight: 3,
        opacity: 0.7,
        fillColor: '#0d6efd',
        fillOpacity: 0.2
    };

    // Add GeoJSON layer
    geoJsonLayer = L.geoJSON(featureData, {
        style: style,
        pointToLayer: function(feature, latlng) {
            return L.circleMarker(latlng, {
                radius: 8,
                fillColor: '#0d6efd',
                color: '#fff',
                weight: 2,
                opacity: 1,
                fillOpacity: 0.8
            });
        },
        onEachFeature: function(feature, layer) {
            var geom = feature.geometry;
            if (!geom) return;
            if (geom.type === 'Point') {
                var coords = geom.coordinates;
                layer.bindPopup(
                    '<strong>Point</strong><br>' +
                    'Lon: ' + coords[0].toFixed(6) + '<br>' +
                    'Lat: ' + coords[1].toFixed(6)
                );
            } else if (geom.type === 'LineString') {
                layer.bindPopup('<strong>LineString</strong><br>' + geom.coordinates.length + ' points');
            } else if (geom.type === 'Polygon') {
                layer.bindPopup('<strong>Polygon</strong><br>' + geom.coordinates[0].length + ' vertices');
            }
        }
    }).addTo(map);
}

// Expose function globally so dereferencer.js can call it
window.initializeMap = initializeMap;
