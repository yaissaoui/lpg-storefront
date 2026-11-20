/*
 * Builds the files to load into DA and the configuration service from the committed sources.
 *
 *   node tools/da/build-da-files.mjs
 *
 * 1. tools/da/placeholders/<root>/<name>.json from placeholders/<lang>/<name>.json.
 *    Same shape as the placeholder sheets of the commerce boilerplate content (a multi-sheet
 *    document with the sheet "data", columns Key and Value, which fetchPlaceholders reads with
 *    ?sheet=data, and the sheet "dnt" that keeps the Key column out of translation).
 *    PUT each file to https://admin.da.live/source/yaissaoui/lpg-storefront/<root>/placeholders/<name>.json
 *    then preview it (https://admin.hlx.page/preview/yaissaoui/lpg-storefront/main/<root>/placeholders/<name>.json).
 * 2. tools/da/public-config.json from config/site-config.public.json: the body to POST to
 *    https://admin.hlx.page/config/yaissaoui/sites/lpg-storefront/public.json. The service
 *    serves it as the "public" object of /config.json, which scripts/commerce.js reads first.
 */
import fs from 'node:fs';
import path from 'node:path';

const root = new URL('../../', import.meta.url).pathname;
const out = path.join(root, 'tools/da');

// store root (getRootPath() of the drop-in config) -> placeholder language
export const ROOTS = {
  'wellbox/fr': 'fr',
  'wellbox/en': 'en',
  fr: 'fr',
  en: 'en',
  // pages outside the four store roots use the "default" config entry (LPG fr)
  '': 'fr',
};

export function toDaSheet(rows) {
  const data = rows.map(({ Key, Value }) => ({ Key, Value }));
  return {
    ':names': ['data', 'dnt'],
    ':version': 3,
    ':type': 'multi-sheet',
    data: {
      total: data.length, offset: 0, limit: data.length, data,
    },
    dnt: {
      total: 1, offset: 0, limit: 1, data: [{ 'dnt-sheet': '*', 'dnt-columns': 'Key' }],
    },
  };
}

function build() {
  const written = [];
  Object.entries(ROOTS).forEach(([storeRoot, lang]) => {
    const srcDir = path.join(root, 'placeholders', lang);
    const dstDir = path.join(out, 'placeholders', storeRoot || '_root');
    fs.mkdirSync(dstDir, { recursive: true });
    fs.readdirSync(srcDir).filter((f) => f.endsWith('.json')).forEach((file) => {
      const { data } = JSON.parse(fs.readFileSync(path.join(srcDir, file), 'utf8'));
      fs.writeFileSync(path.join(dstDir, file), `${JSON.stringify(toDaSheet(data), null, 2)}\n`);
      written.push(path.relative(root, path.join(dstDir, file)));
    });
  });
  const { public: publicConfig } = JSON.parse(fs.readFileSync(path.join(root, 'config/site-config.public.json'), 'utf8'));
  fs.writeFileSync(path.join(out, 'public-config.json'), `${JSON.stringify(publicConfig, null, 2)}\n`);
  written.push('tools/da/public-config.json');
  return written;
}

if (process.argv[1] && path.resolve(process.argv[1]) === new URL(import.meta.url).pathname) {
  const written = build();
  console.log(`${written.length} files written under tools/da`);
}
