/**
 * URI Dereferencer - Main Application Logic
 * Handles SPARQL queries, RDF parsing, and UI rendering
 */

// RDF Namespaces
const NS = {
    RDF: 'http://www.w3.org/1999/02/22-rdf-syntax-ns#',
    RDFS: 'http://www.w3.org/2000/01/rdf-schema#',
    OWL: 'http://www.w3.org/2002/07/owl#',
    XSD: 'http://www.w3.org/2001/XMLSchema#',
    GSP: 'http://www.opengis.net/ont/geosparql#',
    GEO: 'http://www.w3.org/2003/01/geo/wgs84_pos#'
};

// Will be loaded from prefixes.json
let PREFIXES = {};

async function loadPrefixes() {
    try {
        const response = await fetch('/assets/data/prefixes.json');
        if (response.ok) {
            PREFIXES = await response.json();
        }
    } catch (e) {
        console.warn('Could not load prefixes.json, using defaults');
    }
}

class URIDereferencer {
    constructor() {
        this.resourceURI = null;
        this.triples = [];
        this.types = [];
        this.geometryNode = null;
        this.wktLiteral = null;
    }

    /**
     * Initialize the application
     */
    async init() {
        // Load prefixes first
        await loadPrefixes();

        // Extract URI from URL path
        this.resourceURI = this.extractURIFromPath();
        
        if (!this.resourceURI) {
            this.showError('No URI specified. Please provide a resource URI in the path.');
            return;
        }

        // Display URI
        this.displayURI();
        
        // Setup RDF format links
        this.setupRDFFormatLinks();
        
        // Setup copy button
        this.setupCopyButton();

        // Load resource data
        await this.loadResource();
    }

    /**
     * Extract resource URI from URL path
     * 
     * Supports two modes:
     * 1. Production: https://data.matdata.eu/_netPointReferences_swi366_on_ne_348
     *    → Resolves to URI: https://data.matdata.eu/_netPointReferences_swi366_on_ne_348
     * 
     * 2. Testing: http://localhost:8080/http://example.org/resource
     *    → Resolves to URI: http://example.org/resource
     */
    extractURIFromPath() {
        const path = window.location.pathname;
        
        // Remove leading slash
        let uri = path.substring(1);
        
        // If path is empty or just '/', show error
        if (!uri || uri === '/') {
            return null;
        }

        // If it's already a full URI (testing mode), use it directly
        if (uri.startsWith('http://') || uri.startsWith('https://')) {
            return decodeURIComponent(uri);
        }

        // Otherwise, construct URI from base + path (production mode)
        // BASE_URI comes from window.location.origin, so it adapts to deployment
        return CONFIG.BASE_URI + '/' + uri;
    }

    /**
     * Display URI in the header
     */
    displayURI() {
        document.getElementById('uri-display').textContent = this.resourceURI;
        document.title = `Resource: ${this.resourceURI}`;
    }

    /** 
     * Setup RDF format download links
     */
    setupRDFFormatLinks() {
        const formats = {
            'link-turtle':  { accept: 'text/turtle', label: 'Turtle' },
            'link-rdfxml':  { accept: 'application/rdf+xml', label: 'RDF/XML' },
            'link-jsonld':  { accept: 'application/ld+json', label: 'JSON-LD' }
        };

        for (const [id, fmt] of Object.entries(formats)) {
            document.getElementById(id).href = '#';
            document.getElementById(id).onclick = (e) => {
                e.preventDefault();
                this.showRDFFormat(fmt.accept, fmt.label);
            };
        }

        document.getElementById('rdf-close').addEventListener('click', () => {
            document.getElementById('rdf-viewer').style.display = 'none';
        });

        document.getElementById('rdf-copy').addEventListener('click', () => {
            const code = document.getElementById('rdf-code').textContent;
            navigator.clipboard.writeText(code).then(() => {
                const icon = document.getElementById('rdf-copy').querySelector('i');
                icon.className = 'bi bi-check2';
                setTimeout(() => { icon.className = 'bi bi-clipboard'; }, 2000);
            });
        });
    }

    /**
     * Fetch DESCRIBE in a specific format and display
     */
    async showRDFFormat(accept, label) {
        const viewer = document.getElementById('rdf-viewer');
        const code = document.getElementById('rdf-code');
        const title = document.getElementById('rdf-viewer-title');

        title.textContent = label;
        code.textContent = 'Loading...';
        viewer.style.display = 'block';

        try {
            const query = `DESCRIBE <${this.resourceURI}>`;
            const url = CONFIG.SPARQL_ENDPOINT + '?query=' + encodeURIComponent(query);
            const response = await fetch(url, { headers: { 'Accept': accept } });

            if (!response.ok) throw new Error(response.statusText);
            code.textContent = await response.text();
        } catch (err) {
            code.textContent = `Error fetching ${label}: ${err.message}`;
        }
    }

    /**
     * Build a local link for a URI in our entity namespace,
     * or return null if the URI is external.
     */
    makeLocalLink(uri) {
        if (!uri.startsWith(CONFIG.ENTITY_NS)) return null;
        // Production: origin matches entity NS → use just the path
        if (window.location.origin === CONFIG.ENTITY_NS) {
            return uri.substring(CONFIG.ENTITY_NS.length) || '/';
        }
        // Testing: embed the full URI in the path
        return '/' + uri;
    }

    /**
     * Setup copy URI button
     */
    setupCopyButton() {
        document.getElementById('copy-uri').addEventListener('click', () => {
            navigator.clipboard.writeText(this.resourceURI).then(() => {
                const btn = document.getElementById('copy-uri');
                const icon = btn.querySelector('i');
                icon.className = 'bi bi-check2';
                setTimeout(() => {
                    icon.className = 'bi bi-clipboard';
                }, 2000);
            });
        });
    }

    /**
     * Load resource data from SPARQL endpoint
     */
    async loadResource() {
        try {
            document.getElementById('loading').style.display = 'block';

            // Execute DESCRIBE query
            const describeQuery = `DESCRIBE <${this.resourceURI}>`;
            const triples = await this.executeSPARQLQuery(describeQuery);

            if (triples.length === 0) {
                this.showError(`No data found for resource: ${this.resourceURI}`);
                return;
            }

            this.triples = triples;

            // Parse and render resource
            await this.parseResource();
            this.renderProperties();

            // Render interactive graph
            if (typeof window.initializeGraph === 'function') {
                try {
                    await window.initializeGraph(this.triples, CONFIG.SPARQL_ENDPOINT, PREFIXES);
                } catch (graphError) {
                    console.warn('Graph rendering failed:', graphError);
                }
            }

            // Check for geometry
            await this.checkForGeometry();
            
            // Load same-class resources
            await this.loadSameClassResources();

            // Hide loading spinner
            document.getElementById('loading').style.display = 'none';

        } catch (error) {
            console.error('Error loading resource:', error);
            this.showError(`Failed to load resource: ${error.message}`);
        }
    }

    /**
     * Execute SPARQL query and return triples
     */
    async executeSPARQLQuery(query) {
        const url = CONFIG.SPARQL_ENDPOINT + '?query=' + encodeURIComponent(query);
        
        const response = await fetch(url, {
            headers: {
                'Accept': 'application/n-triples'
            }
        });

        if (!response.ok) {
            throw new Error(`SPARQL query failed: ${response.statusText}`);
        }

        const ntriples = await response.text();
        
        // Parse N-Triples using N3.js
        const parser = new N3.Parser();
        const quads = parser.parse(ntriples);
        
        return quads;
    }

    /**
     * Parse resource triples
     */
    async parseResource() {
        // Extract rdf:type values
        this.types = this.triples
            .filter(t => t.predicate.value === NS.RDF + 'type')
            .map(t => t.object.value);

        // Check for gsp:hasGeometry
        const geometryTriples = this.triples.filter(t => 
            t.predicate.value === NS.GSP + 'hasGeometry'
        );

        if (geometryTriples.length > 0) {
            this.geometryNode = geometryTriples[0].object.value;
        }
    }

    /**
     * Render properties table
     */
    renderProperties() {
        const tbody = document.getElementById('properties-tbody');
        tbody.innerHTML = '';

        // Group triples by predicate
        const grouped = {};
        this.triples.forEach(triple => {
            if (triple.subject.value === this.resourceURI) {
                const pred = triple.predicate.value;
                if (!grouped[pred]) {
                    grouped[pred] = [];
                }
                grouped[pred].push(triple.object);
            }
        });

        // Render each property
        Object.keys(grouped).sort().forEach(predicate => {
            const values = grouped[predicate];
            
            const row = document.createElement('tr');
            
            // Property cell
            const propCell = document.createElement('td');
            propCell.innerHTML = this.formatURI(predicate);
            row.appendChild(propCell);

            // Values cell
            const valueCell = document.createElement('td');
            values.forEach((value, index) => {
                if (index > 0) {
                    valueCell.appendChild(document.createElement('br'));
                }
                valueCell.appendChild(this.formatValue(value));
            });
            row.appendChild(valueCell);

            tbody.appendChild(row);
        });

        // Show properties section
        document.getElementById('properties').style.display = 'block';
    }

    /**
     * Format URI for display with prefix
     */
    formatURI(uri) {
        const shortened = this.shortenURI(uri);
        const localLink = this.makeLocalLink(uri);
        const href = localLink || uri;
        const target = localLink ? '' : ' target="_blank" rel="noopener noreferrer"';

        if (shortened !== uri) {
            const parts = shortened.split(':');
            return `<a href="${href}" class="property-uri" title="${uri}"${target}><span class="property-prefix">${parts[0]}:</span><span class="property-label">${parts.slice(1).join(':')}</span></a>`;
        } else {
            return `<a href="${href}" class="property-uri" title="${uri}"${target}>${uri}</a>`;
        }
    }

    /**
     * Format RDF value for display
     */
    formatValue(node) {
        const span = document.createElement('span');

        if (node.termType === 'NamedNode') {
            const link = document.createElement('a');
            const localLink = this.makeLocalLink(node.value);
            link.className = 'value-uri';
            link.title = node.value;
            link.textContent = this.shortenURI(node.value);
            if (localLink) {
                link.href = localLink;
                link.onclick = (e) => {
                    e.preventDefault();
                    window.location.href = localLink;
                };
            } else {
                link.href = node.value;
                link.target = '_blank';
                link.rel = 'noopener noreferrer';
            }
            span.appendChild(link);
        } else if (node.termType === 'Literal') {
            // Literal value
            const literalSpan = document.createElement('span');
            literalSpan.className = 'value-literal';
            literalSpan.textContent = node.value;
            span.appendChild(literalSpan);

            // Add language tag if present
            if (node.language) {
                const langSpan = document.createElement('span');
                langSpan.className = 'value-lang';
                langSpan.textContent = `@${node.language}`;
                span.appendChild(langSpan);
            }

            // Add datatype if present and not xsd:string
            if (node.datatype && node.datatype.value !== NS.XSD + 'string') {
                const dtSpan = document.createElement('span');
                dtSpan.className = 'value-datatype';
                dtSpan.textContent = `^^${this.shortenURI(node.datatype.value)}`;
                span.appendChild(dtSpan);
            }
        } else {
            span.textContent = node.value;
        }

        return span;
    }

    /**
     * Shorten URI with prefix if possible
     */
    shortenURI(uri) {
        for (const [namespace, prefix] of Object.entries(PREFIXES)) {
            if (uri.startsWith(namespace)) {
                return prefix + ':' + uri.substring(namespace.length);
            }
        }
        return uri;
    }

    /**
     * Check for geometry and display map
     */
    async checkForGeometry() {
        if (!this.geometryNode) {
            return;
        }

        try {
            // Query for gsp:asWKT
            const wktQuery = `
                SELECT ?wkt WHERE {
                    <${this.geometryNode}> <${NS.GSP}asWKT> ?wkt .
                }
            `;

            const url = CONFIG.SPARQL_ENDPOINT + '?query=' + encodeURIComponent(wktQuery);
            const response = await fetch(url, {
                headers: {
                    'Accept': 'application/sparql-results+json'
                }
            });

            if (!response.ok) {
                throw new Error('WKT query failed');
            }

            const data = await response.json();
            
            if (data.results.bindings.length > 0) {
                this.wktLiteral = data.results.bindings[0].wkt.value;
                
                // Display WKT
                document.getElementById('wkt-code').textContent = this.wktLiteral;
                
                // Show map section
                document.getElementById('map').style.display = 'block';
                
                // Initialize map (defined in map-viewer.js)
                if (typeof initializeMap === 'function') {
                    initializeMap(this.wktLiteral);
                }
            }
        } catch (error) {
            console.error('Error fetching geometry:', error);
        }
    }

    /**
     * Load resources with same rdf:type
     */
    async loadSameClassResources() {
        if (this.types.length === 0) {
            return;
        }

        try {
            // Query for resources with same type (limit to first type)
            const typeURI = this.types[0];
            const sameClassQuery = `
                SELECT DISTINCT ?resource WHERE {
                    ?resource a <${typeURI}> .
                    FILTER(?resource != <${this.resourceURI}>)
                }
                LIMIT 10
            `;

            const url = CONFIG.SPARQL_ENDPOINT + '?query=' + encodeURIComponent(sameClassQuery);
            const response = await fetch(url, {
                headers: {
                    'Accept': 'application/sparql-results+json'
                }
            });

            if (!response.ok) {
                throw new Error('Same-class query failed');
            }

            const data = await response.json();
            const resources = data.results.bindings.map(b => b.resource.value);

            if (resources.length > 0) {
                this.renderSeeAlso(resources, typeURI);
            }

        } catch (error) {
            console.error('Error loading same-class resources:', error);
            document.getElementById('see-also-loading').style.display = 'none';
        }
    }

    /**
     * Render "See Also" section
     */
    renderSeeAlso(resources, typeURI) {
        document.getElementById('see-also-loading').style.display = 'none';
        
        const list = document.getElementById('see-also-list');
        list.innerHTML = '';

        resources.forEach(resourceURI => {
            const item = document.createElement('li');
            item.className = 'list-group-item';

            const link = document.createElement('a');
            const localLink = this.makeLocalLink(resourceURI);
            link.className = 'resource-link';
            link.title = resourceURI;
            link.textContent = this.shortenURI(resourceURI);
            if (localLink) {
                link.href = localLink;
                link.onclick = (e) => {
                    e.preventDefault();
                    window.location.href = localLink;
                };
            } else {
                link.href = resourceURI;
                link.target = '_blank';
                link.rel = 'noopener noreferrer';
            }

            const typeSpan = document.createElement('div');
            typeSpan.className = 'resource-type mt-1';
            typeSpan.textContent = `Type: ${this.shortenURI(typeURI)}`;

            item.appendChild(link);
            item.appendChild(typeSpan);
            list.appendChild(item);
        });

        document.getElementById('see-also').style.display = 'block';
    }

    /**
     * Show error message
     */
    showError(message) {
        document.getElementById('loading').style.display = 'none';
        document.getElementById('error-message').textContent = message;
        document.getElementById('error').style.display = 'block';
    }
}

// Initialize app when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    const app = new URIDereferencer();
    app.init();
});
