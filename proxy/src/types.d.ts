declare module 'node-forge' {
	export default forge;
	// biome-ignore lint/suspicious/noExplicitAny: node-forge goes when the MITM proxy is replaced by a base-URL proxy
	const forge: any;
}
