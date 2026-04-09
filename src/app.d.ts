// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
declare global {
	namespace App {
		// interface Error {}
		// interface Locals {}
		// interface PageData {}
		// interface PageState {}
		interface Platform {
			env: {
				IMAGES: R2Bucket; // Cloudflare R2 画像バケット
			};
		}
	}
}

export {};
