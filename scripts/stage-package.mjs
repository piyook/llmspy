// `npm run stage` (after the build it runs): writes .npm-package/, the folder
// `npm publish .npm-package` publishes. The root package.json is the repo's
// own (workspaces, dev tools, the Husky `prepare` script), so the package
// gets a manifest of its own instead, with no scripts and no dependencies.
import {
	cpSync,
	mkdirSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from 'node:fs';
import * as path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const out = path.join(root, '.npm-package');
const COPIED = ['proxy/dist', 'ui/dist', 'README.md', 'LICENSE', 'llms.txt'];

const readJson = (file) =>
	JSON.parse(readFileSync(path.join(root, file), 'utf8'));
const writeJson = (file, value) =>
	writeFileSync(
		path.join(out, file),
		`${JSON.stringify(value, null, '\t')}\n`,
	);

const pkg = readJson('package.json');
const proxyPkg = readJson('proxy/package.json');
if (proxyPkg.version !== pkg.version) {
	console.error(
		`Versions differ: package.json ${pkg.version}, proxy/package.json ${proxyPkg.version}.`,
	);
	process.exit(1);
}

rmSync(out, { recursive: true, force: true });
mkdirSync(out);
for (const file of COPIED) {
	cpSync(path.join(root, file), path.join(out, file), { recursive: true });
}

const fields = [
	'name',
	'version',
	'description',
	'license',
	'author',
	'homepage',
	'repository',
	'bugs',
	'keywords',
	'engines',
];
writeJson('package.json', {
	...Object.fromEntries(fields.map((field) => [field, pkg[field]])),
	bin: { llmspy: 'proxy/dist/cli.js' },
});
// proxy/dist is ES modules, and index.js reads LLMSpy's version from here.
writeJson('proxy/package.json', {
	name: proxyPkg.name,
	version: proxyPkg.version,
	private: true,
	type: proxyPkg.type,
});

console.log(
	`Staged ${pkg.name} ${pkg.version} in ${path.relative(root, out)}/`,
);
