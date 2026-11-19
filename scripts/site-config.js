/*
 * Site and locale resolution.
 *
 * The site (lpg or wellbox) comes from the hostname. On dev hosts (localhost, *.aem.page)
 * a developer can force it with ?site=<key> (kept in localStorage, ?site=auto clears it)
 * or with the site's devPathPrefix (/wellbox/...), so both sites can be previewed from
 * one `aem up` process.
 * The locale comes from the first path segment (EDS folder, hyphens) and maps explicitly
 * to a Commerce store view code (underscores), for example pro-fr -> pro_fr.
 *
 * The pure functions take every input as an argument so they run under node --test.
 */

export const CONFIG_PATH = '/config/sites.json';

export function isDevHost(config, hostname = '') {
  return (config.devHosts || []).some((h) => (h.startsWith('.') ? hostname.endsWith(h) : hostname === h));
}

function matchesPrefix(pathname, prefix) {
  return !!prefix && (pathname === prefix || pathname.startsWith(`${prefix}/`));
}

/**
 * Picks the site key.
 * Order on dev hosts: query parameter, dev path prefix, stored override, hostname, default.
 * Order elsewhere: hostname, default.
 */
export function pickSiteKey(config, {
  hostname = '', pathname = '/', search = '', storedSite = null,
} = {}) {
  const sites = config.sites || {};
  if (isDevHost(config, hostname)) {
    const param = new URLSearchParams(search).get(config.devOverride?.queryParam || 'site');
    if (param && sites[param]) return { key: param, source: 'query' };
    const byPath = Object.keys(sites).find((k) => matchesPrefix(pathname, sites[k].devPathPrefix));
    if (byPath) return { key: byPath, source: 'path' };
    if (storedSite && sites[storedSite]) return { key: storedSite, source: 'storage' };
  }
  const byHost = Object.keys(sites)
    .find((k) => (sites[k].hostMatch || []).some((m) => hostname.includes(m)));
  if (byHost) return { key: byHost, source: 'host' };
  return { key: config.defaultSite || Object.keys(sites)[0], source: 'default' };
}

/** Maps an EDS folder prefix (pro-fr) to a Commerce store view code (pro_fr). */
export function storeCodeFor(config, siteKey, prefix) {
  const site = config.sites?.[siteKey];
  const locale = site?.locales.find((l) => l.prefix === prefix);
  return locale ? locale.store : null;
}

/**
 * Builds the full context for one request.
 * @returns {object} context with site, locale, storeCode, sells, basePath, url(), localeUrl()
 */
export function resolveContext(config, env = {}) {
  const { key, source } = pickSiteKey(config, env);
  const site = config.sites[key];
  const dev = isDevHost(config, env.hostname);
  const devPrefix = dev && site.devPathPrefix ? site.devPathPrefix : '';

  let path = env.pathname || '/';
  if (matchesPrefix(path, devPrefix)) path = path.slice(devPrefix.length) || '/';
  const first = path.split('/').filter(Boolean)[0];
  const exact = site.locales.find((l) => l.prefix === first);
  const locale = exact || site.locales[0];
  const relativePath = exact ? (path.slice(locale.prefix.length + 1) || '/') : path;
  const basePath = `${devPrefix}/${locale.prefix}`;

  const endpoint = (dev && env.endpointOverride)
    || site['commerce-endpoint']
    || config['commerce-endpoint']
    || '';

  const join = (base, p = '/') => `${base}${p.startsWith('/') ? p : `/${p}`}`;

  return {
    siteKey: key,
    siteSource: source,
    site,
    theme: site.theme || key,
    locale,
    locales: site.locales,
    storeCode: locale.store,
    lang: locale.lang,
    numberLocale: locale.numberLocale || locale.lang,
    currency: locale.currency || 'EUR',
    sells: !!locale.sells,
    miniCart: locale.miniCart ?? !!locale.sells,
    professional: !!locale.professional,
    priceSuffix: locale.priceSuffix || '',
    basePath,
    relativePath,
    endpoint,
    dev,
    productAttributes: config.productAttributes || {},
    /** Builds a link inside the current site and locale. */
    url: (p) => join(basePath, p),
    /** Same page in another locale of the same site. */
    localeUrl: (target) => join(`${devPrefix}/${target.prefix}`, relativePath),
  };
}

let configPromise;
let contextPromise;

/** Loads /config/sites.json once (browser). */
export function loadSiteConfig() {
  if (!configPromise) {
    configPromise = fetch(CONFIG_PATH).then((r) => {
      if (!r.ok) throw new Error(`${CONFIG_PATH}: HTTP ${r.status}`);
      return r.json();
    });
  }
  return configPromise;
}

function safeStorage() {
  try {
    return window.localStorage;
  } catch (e) {
    return null;
  }
}

/** Browser entry point. Resolves the context once per page. */
export function getSiteContext() {
  if (!contextPromise) {
    contextPromise = loadSiteConfig().then((config) => {
      const { hostname, pathname, search } = window.location;
      const storage = safeStorage();
      const keys = config.devOverride || {};
      const dev = isDevHost(config, hostname);
      if (dev && storage) {
        const param = new URLSearchParams(search).get(keys.queryParam || 'site');
        if (param === 'auto') storage.removeItem(keys.storageKey);
        else if (param && config.sites[param]) storage.setItem(keys.storageKey, param);
      }
      return resolveContext(config, {
        hostname,
        pathname,
        search,
        storedSite: dev && storage ? storage.getItem(keys.storageKey) : null,
        endpointOverride: dev && storage ? storage.getItem(keys.endpointStorageKey) : null,
      });
    });
  }
  return contextPromise;
}
