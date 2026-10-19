// Child process for settings.test.ts: N locked increments on one file.
import {
	createSettingsStore,
	sanitize,
} from "@underactive/pi-topping-primitives/settings";

const [file, count] = process.argv.slice(2);
if (file === undefined || count === undefined)
	throw new Error("usage: file count");

const store = createSettingsStore<{ n: number }>({
	path: () => file,
	codec: {
		sanitize: (raw) => ({
			n: sanitize.numberOr(sanitize.isRecord(raw) ? raw.n : undefined, 0, {
				integer: true,
			}),
		}),
	},
	lock: { attempts: 400, retryMs: 5 },
});

for (let i = 0; i < Number(count); i += 1) {
	const result = store.update((current) => ({ n: current.n + 1 }));
	if (!result.ok) {
		process.stderr.write(`${result.reason}: ${result.message}\n`);
		process.exit(1);
	}
}
