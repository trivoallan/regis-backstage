#!/usr/bin/env node
/*
 * Generates the Regis demo dataset from a single source of truth so the catalog
 * entities, the provider index, and the report.json fixtures stay consistent.
 *
 * Run:  node examples/regis-dataset.cjs
 * Emits (under examples/):
 *   reports/<key>.json     — one realistic report per image
 *   regis-index.d/         — the published report index as fragments (index.json + images/<slug>.json)
 *   regis-catalog.yaml     — System + services + image/playbook Resources
 *   org.yaml               — guests + the demo teams
 *   regis-history.json     — synthetic per-image snapshot history (history seed)
 *
 * Reports are served locally for the demo:  npx http-server examples -p 8080
 * so report URLs are http://localhost:8080/reports/<key>.json
 */
const fs = require('fs');
const path = require('path');

const REPORT_BASE = 'http://localhost:8080/reports';
const VERSION = '0.34.0';
const SNAPSHOT = '2026-06-01';

// History trajectory: three monthly snapshots ending at each image's current score.
const HISTORY_DATES = ['2026-04-01', '2026-05-01', SNAPSHOT];
const tierFor = s => (s >= 90 ? 'Gold' : s >= 70 ? 'Silver' : 'Bronze');

// Per-image score path; the last element is always the image's current score.
function scorePath(img) {
  if (img.key === 'search') return [91, 78, img.score]; // a decline (drift demo)
  if (img.tier === 'Gold') return [82, 92, img.score];
  if (img.tier === 'Silver') return [65, 74, img.score];
  return [60, 62, img.score];
}

// --- shared rule catalogue (slug, description, gating level, tags) ----------
const RULES = [
  { slug: 'no-critical-cve', description: 'No critical vulnerabilities', level: 'Gold', tags: ['security'], analyzers: ['cve'] },
  { slug: 'no-high-cve', description: 'No high vulnerabilities', level: 'Silver', tags: ['security'], analyzers: ['cve'] },
  { slug: 'fixable-cves-patched', description: 'All fixable CVEs are patched', level: 'Bronze', tags: ['security'], analyzers: ['cve'] },
  { slug: 'runs-as-nonroot', description: 'Runs as a non-root user', level: 'Silver', tags: ['hygiene'], analyzers: ['oci'] },
  { slug: 'has-healthcheck', description: 'Declares a HEALTHCHECK', level: 'Bronze', tags: ['hygiene'], analyzers: ['oci'] },
  { slug: 'pinned-base-image', description: 'Base image pinned by digest', level: 'Silver', tags: ['supply-chain'], analyzers: ['oci'] },
  { slug: 'image-signed', description: 'Image is signed (cosign)', level: 'Gold', tags: ['supply-chain'], analyzers: ['oci'] },
  { slug: 'oci-source-labels', description: 'OCI source/revision labels present', level: 'Bronze', tags: ['observability'], analyzers: ['oci'] },
];

const PLAYBOOKS = [
  { id: 'default', title: 'Regis Default Playbook', version: '1.0.0', owner: 'team-platform' },
  { id: 'pci-dss', title: 'PCI-DSS Hardened Playbook', version: '2.1.0', owner: 'team-payments' },
];

const d = h => h.repeat(32); // 64-hex digest helper
const slugForImageRef = ref => ref.replace(/[^A-Za-z0-9._-]/g, '_');

// --- the dataset: one entry per analyzed image ------------------------------
const IMAGES = [
  {
    key: 'storefront-web', registry: 'ghcr.io', repository: 'shop/storefront-web', tag: '2.3.0',
    digest: `sha256:${d('a1')}`, owner: 'team-storefront', system: 'shop', playbook: 'default',
    tier: 'Gold', score: 100, fail: [],
    cve: { vulnerability_count: 6, critical_count: 0, high_count: 0, medium_count: 1, low_count: 5, negligible_count: 0, unknown_count: 0, fixed_count: 2 },
    platforms: [{ architecture: 'amd64', os: 'linux' }, { architecture: 'arm64', os: 'linux' }],
  },
  {
    key: 'catalog-api', registry: 'ghcr.io', repository: 'shop/catalog-api', tag: '4.1.0',
    digest: `sha256:${d('b2')}`, owner: 'team-search', system: 'shop', playbook: 'default',
    tier: 'Gold', score: 95, fail: ['oci-source-labels'],
    cve: { vulnerability_count: 9, critical_count: 0, high_count: 0, medium_count: 2, low_count: 7, negligible_count: 0, unknown_count: 0, fixed_count: 3 },
    platforms: [{ architecture: 'amd64', os: 'linux' }],
  },
  {
    key: 'checkout-api', registry: 'ghcr.io', repository: 'shop/checkout-api', tag: '1.8.2',
    digest: `sha256:${d('c3')}`, owner: 'team-payments', system: 'shop', playbook: 'default',
    tier: 'Silver', score: 82, fail: ['image-signed', 'runs-as-nonroot'],
    cve: { vulnerability_count: 14, critical_count: 0, high_count: 0, medium_count: 5, low_count: 9, negligible_count: 0, unknown_count: 0, fixed_count: 6 },
    platforms: [{ architecture: 'amd64', os: 'linux' }],
  },
  {
    key: 'payments-gateway', registry: 'ghcr.io', repository: 'shop/payments-gateway', tag: '3.0.1',
    digest: `sha256:${d('d4')}`, owner: 'team-payments', system: 'shop', playbook: 'pci-dss',
    tier: 'Silver', score: 78, fail: ['image-signed', 'pinned-base-image'],
    cve: { vulnerability_count: 11, critical_count: 0, high_count: 0, medium_count: 3, low_count: 8, negligible_count: 0, unknown_count: 0, fixed_count: 5 },
    platforms: [{ architecture: 'amd64', os: 'linux' }],
  },
  {
    key: 'search', registry: 'ghcr.io', repository: 'shop/search', tag: '8.12.0',
    digest: `sha256:${d('e5')}`, owner: 'team-search', system: 'shop', playbook: 'default',
    tier: 'Bronze', score: 64, fail: ['no-high-cve', 'runs-as-nonroot', 'image-signed'],
    cve: { vulnerability_count: 38, critical_count: 0, high_count: 3, medium_count: 11, low_count: 24, negligible_count: 0, unknown_count: 0, fixed_count: 9 },
    platforms: [{ architecture: 'amd64', os: 'linux' }],
  },
  {
    key: 'nginx', registry: 'registry-1.docker.io', repository: 'library/nginx', tag: '1.27',
    digest: `sha256:${d('f6')}`, owner: 'team-platform', system: 'shop', playbook: 'default',
    tier: 'Gold', score: 100, fail: [],
    cve: { vulnerability_count: 17, critical_count: 0, high_count: 0, medium_count: 4, low_count: 13, negligible_count: 0, unknown_count: 0, fixed_count: 5 },
    platforms: [{ architecture: 'amd64', os: 'linux' }, { architecture: 'arm64', os: 'linux' }],
    // A second tag pointing at the same digest -> linked as an alias.
    aliasTags: ['latest'],
  },
];

const TEAMS = ['team-storefront', 'team-search', 'team-payments', 'team-platform'];

const SERVICES = [
  { name: 'storefront-web', title: 'Storefront Web', description: 'Customer-facing web storefront.', owner: 'team-storefront', images: ['storefront-web', 'nginx'] },
  { name: 'catalog-api', title: 'Catalog API', description: 'Product catalogue service.', owner: 'team-search', images: ['catalog-api'] },
  { name: 'search', title: 'Search', description: 'Full-text product search.', owner: 'team-search', images: ['search'] },
  { name: 'checkout-api', title: 'Checkout API', description: 'Cart and checkout orchestration.', owner: 'team-payments', images: ['checkout-api', 'nginx'] },
  { name: 'payments-gateway', title: 'Payments Gateway', description: 'PCI-scoped payment processing.', owner: 'team-payments', images: ['payments-gateway'] },
];

// --- helpers ----------------------------------------------------------------
const sanitize = raw =>
  raw.toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/-+/g, '-').replace(/^[-.]+|[-.]+$/g, '') || 'unnamed';

const imageRefOf = img => `${img.registry}/${img.repository}:${img.tag}`;
const entityNameOf = (repository, tag) => sanitize(`${repository}-${tag}`);
const scoreBand = s => (s < 50 ? '0-49' : s < 80 ? '50-79' : s < 90 ? '80-89' : '90-100');
const grade = s => (s >= 90 ? 'A' : s >= 75 ? 'B' : s >= 50 ? 'C' : 'D');
const badgeClass = tier => (tier === 'Gold' ? 'success' : tier === 'Silver' ? 'warning' : 'error');

function buildReport(img) {
  const passed = slug => !img.fail.includes(slug);
  const rules = RULES.map(r => ({
    slug: r.slug,
    description: r.description,
    level: r.level,
    tags: r.tags,
    passed: passed(r.slug),
    status: passed(r.slug) ? 'passed' : 'failed',
    message: passed(r.slug) ? `${r.description}: OK` : `${r.description}: not met`,
    analyzers: r.analyzers,
  }));
  const tags = [...new Set(RULES.flatMap(r => r.tags))];
  const by_tag = {};
  for (const tag of tags) {
    const inTag = RULES.filter(r => r.tags.includes(tag)).map(r => r.slug);
    const passedInTag = inTag.filter(passed);
    by_tag[tag] = { rules: inTag, passed_rules: passedInTag, score: Math.round((passedInTag.length / inTag.length) * 100) };
  }
  const securityScore = by_tag.security ? by_tag.security.score : 100;
  return {
    schemaVersion: 1,
    version: VERSION,
    snapshot_date: SNAPSHOT,
    tier: img.tier,
    badges: [
      { slug: 'tier', scope: 'tier', value: img.tier, class: badgeClass(img.tier), label: `Tier: ${img.tier}` },
      { slug: 'security', scope: 'security', value: grade(securityScore), class: securityScore >= 75 ? 'success' : securityScore >= 50 ? 'warning' : 'error', label: `Security: ${grade(securityScore)}` },
    ],
    links: [{ label: 'Playbook', url: `https://example.test/playbooks/${img.playbook}` }],
    request: {
      url: imageRefOf(img),
      registry: img.registry,
      repository: img.repository,
      tag: img.tag,
      digest: img.digest,
      analyzers: ['cve', 'oci'],
      timestamp: `${SNAPSHOT}T08:00:00+00:00`,
    },
    results: {
      oci: { analyzer: 'oci', repository: img.repository, tag: img.tag, platforms: img.platforms },
      cve: { analyzer: 'cve', repository: img.repository, tag: img.tag, scanner_version: '0.74.1', ...img.cve, targets: [] },
    },
    rules,
    rules_summary: {
      score: img.score,
      total: rules.map(r => r.slug),
      passed: rules.filter(r => r.passed).map(r => r.slug),
      by_tag,
    },
  };
}

// --- index ------------------------------------------------------------------
function buildIndex() {
  const images = [];
  for (const img of IMAGES) {
    const base = {
      digest: img.digest,
      reportUrl: `${REPORT_BASE}/${img.key}.json`,
      tier: img.tier,
      score: img.score,
      playbook: img.playbook,
      owner: `group:default/${img.owner}`,
      system: img.system,
    };
    images.push({ imageRef: imageRefOf(img), ...base });
    for (const alias of img.aliasTags ?? []) {
      images.push({ imageRef: `${img.registry}/${img.repository}:${alias}`, ...base });
    }
  }
  return { schemaVersion: 1, playbooks: PLAYBOOKS, images };
}

// --- history ----------------------------------------------------------------
function buildHistory() {
  const snapshots = [];
  for (const img of IMAGES) {
    const path = scorePath(img);
    HISTORY_DATES.forEach((date, i) => {
      const score = path[i];
      snapshots.push({
        imageRef: imageRefOf(img),
        snapshotDate: date,
        digest: img.digest,
        tier: tierFor(score),
        score,
        playbook: img.playbook,
        owner: `group:default/${img.owner}`,
        system: img.system,
        reportUrl: `${REPORT_BASE}/${img.key}.json`,
        recordedAt: `${date}T08:00:00.000Z`,
      });
    });
  }
  return snapshots;
}

// --- YAML emit (entities are uniform, so simple templating is safe) ---------
const LOC = '# Generated by examples/regis-dataset.cjs — edit the generator, not this file.';

function imageEntities() {
  const out = [];
  for (const img of IMAGES) {
    const refs = [imageRefOf(img), ...(img.aliasTags ?? []).map(a => `${img.registry}/${img.repository}:${a}`)];
    refs.forEach((ref, i) => {
      const tag = ref.split(':').pop();
      const name = entityNameOf(img.repository, tag);
      const leaf = img.repository.split('/').pop();
      const aliases = refs.filter(r => r !== ref);
      const aliasEntityRefs = aliases.map(
        a => `resource:default/${entityNameOf(img.repository, a.split(':').pop())}`,
      );
      out.push(
        [
          'apiVersion: backstage.io/v1alpha1',
          'kind: Resource',
          'metadata:',
          `  name: ${name}`,
          `  title: '${leaf}:${tag}'`,
          `  description: Container image ${ref}`,
          '  labels:',
          `    regis.io/tier: ${img.tier.toLowerCase()}`,
          `    regis.io/score-band: '${scoreBand(img.score)}'`,
          '  annotations:',
          `    regis.io/report-url: ${REPORT_BASE}/${img.key}.json`,
          `    regis.io/image-ref: ${ref}`,
          `    regis.io/image-digest: '${img.digest}'`,
          ...(aliases.length ? [`    regis.io/image-aliases: ${aliases.join(', ')}`] : []),
          ...(aliasEntityRefs.length
            ? [`    regis.io/alias-of: ${aliasEntityRefs.join(', ')}`]
            : []),
          `    regis.io/score: '${img.score}'`,
          `    regis.io/playbook: resource:default/regis-playbook-${img.playbook}`,
          'spec:',
          '  type: container-image',
          `  owner: ${img.owner}`,
          `  system: ${img.system}`,
          '  dependsOn:',
          `    - resource:default/regis-playbook-${img.playbook}`,
        ].join('\n'),
      );
    });
  }
  return out;
}

function playbookEntities() {
  return PLAYBOOKS.map(pb =>
    [
      'apiVersion: backstage.io/v1alpha1',
      'kind: Resource',
      'metadata:',
      `  name: regis-playbook-${pb.id}`,
      `  title: ${pb.title}`,
      '  description: Quality standard images are assessed against.',
      '  labels:',
      `    app.kubernetes.io/version: '${pb.version}'`,
      '  annotations:',
      `    regis.io/playbook-id: ${pb.id}`,
      'spec:',
      '  type: regis-playbook',
      `  owner: ${pb.owner}`,
    ].join('\n'),
  );
}

function serviceEntities() {
  return SERVICES.map(svc => {
    const deps = svc.images.map(key => {
      const img = IMAGES.find(i => i.key === key);
      return `    - resource:default/${entityNameOf(img.repository, img.tag)}`;
    });
    return [
      'apiVersion: backstage.io/v1alpha1',
      'kind: Component',
      'metadata:',
      `  name: ${svc.name}`,
      `  title: ${svc.title}`,
      `  description: ${svc.description}`,
      'spec:',
      '  type: service',
      '  lifecycle: production',
      `  owner: ${svc.owner}`,
      '  system: shop',
      '  dependsOn:',
      ...deps,
    ].join('\n');
  });
}

function systemEntity() {
  return [
    'apiVersion: backstage.io/v1alpha1',
    'kind: System',
    'metadata:',
    '  name: shop',
    '  title: Shop',
    '  description: E-commerce platform composed of several services and their images.',
    'spec:',
    '  owner: team-platform',
  ].join('\n');
}

function catalogYaml() {
  const blocks = [systemEntity(), ...playbookEntities(), ...serviceEntities(), ...imageEntities()];
  return [
    '# Regis Backstage — example catalog (e-commerce "shop").',
    LOC,
    '#',
    '# Demonstrates the canonical entity model with multiple teams, a System of',
    '# several services, shared images (nginx, with a linked alias), two playbooks,',
    '# and realistic posture. Reports are served locally for the demo:',
    '#   npx http-server examples -p 8080',
    '',
    blocks.join('\n---\n'),
    '',
  ].join('\n');
}

function orgYaml() {
  const groups = ['guests', ...TEAMS].map(name =>
    [
      'apiVersion: backstage.io/v1alpha1',
      'kind: Group',
      'metadata:',
      `  name: ${name}`,
      'spec:',
      '  type: team',
      '  children: []',
    ].join('\n'),
  );
  const user = [
    'apiVersion: backstage.io/v1alpha1',
    'kind: User',
    'metadata:',
    '  name: guest',
    'spec:',
    '  memberOf: [guests]',
  ].join('\n');
  return ['# Generated by examples/regis-dataset.cjs.', '', [user, ...groups].join('\n---\n'), ''].join('\n');
}

// --- write ------------------------------------------------------------------
const root = path.join(__dirname);
const reportsDir = path.join(root, 'reports');
fs.mkdirSync(reportsDir, { recursive: true });
for (const img of IMAGES) {
  fs.writeFileSync(path.join(reportsDir, `${img.key}.json`), `${JSON.stringify(buildReport(img), null, 2)}\n`);
}
const index = buildIndex();
const indexDir = path.join(root, 'regis-index.d');
const imagesDir = path.join(indexDir, 'images');
fs.rmSync(indexDir, { recursive: true, force: true });
fs.mkdirSync(imagesDir, { recursive: true });
fs.writeFileSync(
  path.join(indexDir, 'index.json'),
  `${JSON.stringify({ schemaVersion: index.schemaVersion, playbooks: index.playbooks }, null, 2)}\n`,
);
for (const entry of index.images) {
  fs.writeFileSync(
    path.join(imagesDir, `${slugForImageRef(entry.imageRef)}.json`),
    `${JSON.stringify(entry, null, 2)}\n`,
  );
}
fs.writeFileSync(path.join(root, 'regis-history.json'), `${JSON.stringify(buildHistory(), null, 2)}\n`);
fs.writeFileSync(path.join(root, 'regis-catalog.yaml'), catalogYaml());
fs.writeFileSync(path.join(root, 'org.yaml'), orgYaml());

const reportCount = IMAGES.length;
const entityCount = 1 + PLAYBOOKS.length + SERVICES.length + IMAGES.reduce((n, i) => n + 1 + (i.aliasTags?.length ?? 0), 0);
console.log(`Wrote ${reportCount} reports, regis-index.d/, regis-history.json, regis-catalog.yaml (${entityCount} entities), org.yaml (${TEAMS.length + 1} groups).`);
