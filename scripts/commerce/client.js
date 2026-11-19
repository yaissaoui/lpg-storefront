/*
 * HTTP transport to Commerce GraphQL. Only this file knows about fetch, headers and HTTP verbs.
 * The same transport serves the PaaS core GraphQL (Store header) and the Commerce Optimizer
 * Merchandising GraphQL (AC-* headers, no Store header).
 */

export class CommerceError extends Error {
  constructor(message, code = 'COMMERCE_ERROR', details = undefined) {
    super(message);
    this.name = 'CommerceError';
    this.code = code;
    this.details = details;
  }
}

/** Collapses whitespace so GET URLs stay short. */
export function minify(query) {
  return query.replace(/\s+/g, ' ').trim();
}

export function buildGetUrl(endpoint, { query, variables, operationName }) {
  const params = new URLSearchParams();
  params.set('query', minify(query));
  if (operationName) params.set('operationName', operationName);
  if (variables && Object.keys(variables).length) params.set('variables', JSON.stringify(variables));
  return `${endpoint}${endpoint.includes('?') ? '&' : '?'}${params.toString()}`;
}

/**
 * @param {object} opts
 * @param {string} opts.endpoint absolute GraphQL URL, for example https://host/graphql
 * @param {string} [opts.store] Commerce store view code, sent as the Store header when set
 * @param {object} [opts.headers] extra headers sent with every request
 * @param {Function} [opts.fetchImpl] injectable fetch for tests
 * @returns {Function} transport({ query, variables, operationName, method, headers }) -> JSON
 */
export function createHttpTransport({
  endpoint, store, headers: fixedHeaders = {}, fetchImpl,
}) {
  const doFetch = fetchImpl || ((...args) => fetch(...args));
  return async function transport(request) {
    const headers = { Accept: 'application/json', ...fixedHeaders, ...(request.headers || {}) };
    if (store) headers.Store = store;
    let resp;
    try {
      if (request.method === 'GET') {
        resp = await doFetch(buildGetUrl(endpoint, request), { method: 'GET', headers, credentials: 'omit' });
      } else {
        resp = await doFetch(endpoint, {
          method: 'POST',
          headers: { ...headers, 'Content-Type': 'application/json' },
          credentials: 'omit',
          body: JSON.stringify({
            query: minify(request.query),
            variables: request.variables || {},
            operationName: request.operationName,
          }),
        });
      }
    } catch (e) {
      throw new CommerceError(`Network error: ${e.message}`, 'NETWORK_ERROR');
    }
    let json;
    try {
      json = await resp.json();
    } catch (e) {
      throw new CommerceError(`HTTP ${resp.status}: response is not JSON`, 'HTTP_ERROR');
    }
    if (!resp.ok && !json?.data) {
      throw new CommerceError(`HTTP ${resp.status}`, 'HTTP_ERROR', json?.errors);
    }
    return json;
  };
}

/**
 * Wraps a transport into run(op, variables, { headers, method }) -> { data, errors }.
 * Commerce and ACO answer 200 with { errors, data: { field: null } } for most failures.
 */
export function createRunner(send) {
  return async function run(op, variables = {}, { headers, method } = {}) {
    const json = await send({
      query: op.query,
      variables,
      operationName: op.name,
      method: method || op.method,
      headers,
    });
    const empty = !json?.data || Object.values(json.data).every((v) => v == null);
    if (json?.errors?.length && empty) {
      throw new CommerceError(json.errors[0].message, 'GRAPHQL_ERROR', json.errors);
    }
    return { data: json?.data || {}, errors: json?.errors || [] };
  };
}
