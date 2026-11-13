import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import forge from 'node-forge';

export class CertificateAuthority {
	private caCertPath: string;
	private caKeyPath: string;

	constructor() {
		const certDir = path.join(os.homedir(), '.llmspy');
		if (!fs.existsSync(certDir)) {
			fs.mkdirSync(certDir, { recursive: true });
		}
		this.caCertPath = path.join(certDir, 'ca.crt');
		this.caKeyPath = path.join(certDir, 'ca.key');
	}

	private generateCA(): { cert: string; key: string } {
		const keys = forge.pki.rsa.generateKeyPair(2048);
		const cert = forge.pki.createCertificate();

		cert.publicKey = keys.publicKey;
		cert.serialNumber = '01';
		cert.validity.notBefore = new Date();
		cert.validity.notAfter = new Date();
		cert.validity.notAfter.setFullYear(
			cert.validity.notBefore.getFullYear() + 10,
		);

		const attrs = [
			{
				name: 'commonName',
				value: 'LLMSpy CA',
			},
			{
				name: 'countryName',
				value: 'US',
			},
			{
				shortName: 'ST',
				value: 'California',
			},
			{
				name: 'localityName',
				value: 'San Francisco',
			},
			{
				name: 'organizationName',
				value: 'LLMSpy',
			},
			{
				shortName: 'OU',
				value: 'LLMSpy CA',
			},
		];

		cert.setSubject(attrs);
		cert.setIssuer(attrs);
		cert.setExtensions([
			{
				name: 'basicConstraints',
				cA: true,
			},
			{
				name: 'keyUsage',
				keyCertSign: true,
				digitalSignature: true,
				nonRepudiation: true,
				keyEncipherment: true,
				dataEncipherment: true,
			},
			{
				name: 'extKeyUsage',
				serverAuth: true,
				clientAuth: true,
			},
		]);

		cert.sign(keys.privateKey, forge.md.sha256.create());

		return {
			cert: forge.pki.certificateToPem(cert),
			key: forge.pki.privateKeyToPem(keys.privateKey),
		};
	}

	public getCA(): { cert: string; key: string } {
		if (fs.existsSync(this.caCertPath) && fs.existsSync(this.caKeyPath)) {
			return {
				cert: fs.readFileSync(this.caCertPath, 'utf8'),
				key: fs.readFileSync(this.caKeyPath, 'utf8'),
			};
		}

		const ca = this.generateCA();
		fs.writeFileSync(this.caCertPath, ca.cert);
		fs.writeFileSync(this.caKeyPath, ca.key);
		return ca;
	}

	public generateServerCert(hostname: string): { cert: string; key: string } {
		const ca = this.getCA();
		const keys = forge.pki.rsa.generateKeyPair(2048);
		const cert = forge.pki.createCertificate();

		cert.publicKey = keys.publicKey;
		cert.serialNumber = Math.floor(Math.random() * 100000).toString();
		cert.validity.notBefore = new Date();
		cert.validity.notAfter = new Date();
		cert.validity.notAfter.setFullYear(
			cert.validity.notBefore.getFullYear() + 1,
		);

		const attrs = [
			{
				name: 'commonName',
				value: hostname,
			},
			{
				name: 'countryName',
				value: 'US',
			},
			{
				shortName: 'ST',
				value: 'California',
			},
			{
				name: 'localityName',
				value: 'San Francisco',
			},
			{
				name: 'organizationName',
				value: 'LLMSpy',
			},
			{
				shortName: 'OU',
				value: 'LLMSpy Proxy',
			},
		];

		cert.setSubject(attrs);
		cert.setIssuer(
			forge.pki.certificateFromPem(ca.cert).subject.attributes,
		);

		cert.setExtensions([
			{
				name: 'basicConstraints',
				cA: false,
			},
			{
				name: 'keyUsage',
				digitalSignature: true,
				nonRepudiation: true,
				keyEncipherment: true,
				dataEncipherment: true,
			},
			{
				name: 'extKeyUsage',
				serverAuth: true,
				clientAuth: true,
			},
			{
				name: 'subjectAltName',
				altNames: [
					{
						type: 2,
						value: hostname,
					},
				],
			},
		]);

		cert.sign(
			forge.pki.privateKeyFromPem(ca.key),
			forge.md.sha256.create(),
		);

		return {
			cert: forge.pki.certificateToPem(cert),
			key: forge.pki.privateKeyToPem(keys.privateKey),
		};
	}

	public getCertPath(): string {
		return this.caCertPath;
	}
}
