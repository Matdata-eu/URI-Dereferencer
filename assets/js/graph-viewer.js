/**
 * Graph Viewer - Interactive RDF Graph using yasgui-graph-plugin
 * Renders an interactive graph for the dereferenced entity.
 */

import GraphPlugin from '/vendor/yasgui-graph-plugin/dist/yasgui-graph-plugin.esm.js';

let graphPlugin = null;

/**
 * Convert N3.js quads to SPARQL-style binding objects expected by the graph plugin.
 */
function quadsToBindings(quads) {
    return quads.map(q => ({
        subject: {
            value: q.subject.value,
            type:  q.subject.termType === 'BlankNode' ? 'bnode' : 'uri',
        },
        predicate: {
            value: q.predicate.value,
            type:  'uri',
        },
        object: {
            value:      q.object.value,
            type:       q.object.termType === 'Literal'   ? 'literal'
                      : q.object.termType === 'BlankNode' ? 'bnode'
                      : 'uri',
            datatype:   q.object.datatype?.value,
            'xml:lang': q.object.language || undefined,
        },
    }));
}

/**
 * Initialize and render the graph from an array of N3.js quads.
 *
 * @param {import('n3').Quad[]} quads   - Parsed RDF triples
 * @param {string}              sparqlEndpoint - SPARQL endpoint URL for expansion
 * @param {Record<string,string>} prefixes     - Prefix map for label shortening
 */
async function initializeGraph(quads, sparqlEndpoint, prefixes) {
    const container = document.getElementById('graph-container');
    if (!container) return;

    // Destroy previous instance if any
    if (graphPlugin) {
        graphPlugin.destroy();
        graphPlugin = null;
    }

    const bindings = quadsToBindings(quads);
    if (bindings.length === 0) return;

    // graph plugin expects { prefixName: uri } but prefixes.json stores { uri: prefixName }
    const invertedPrefixes = Object.fromEntries(
        Object.entries(prefixes || {}).map(([uri, name]) => [name, uri])
    );

    const mockYasr = {
        results: {
            getBindings: () => bindings,
        },
        resultsEl: container,

        getPrefixes: () => invertedPrefixes,

        executeQuery: async (sparqlQuery, { acceptHeader, signal } = {}) => {
            const params = new URLSearchParams({ query: sparqlQuery });
            const response = await fetch(`${sparqlEndpoint}?${params}`, {
                headers: { Accept: acceptHeader ?? 'text/turtle' },
                signal,
            });
            if (!response.ok) {
                throw new Error(`SPARQL expansion failed: ${response.statusText}`);
            }
            return response;
        },
    };

    graphPlugin = new GraphPlugin(mockYasr);
    await graphPlugin.draw();

    document.getElementById('graph-section').style.display = 'block';
}

// Expose function globally so dereferencer.js (non-module) can call it
window.initializeGraph = initializeGraph;
