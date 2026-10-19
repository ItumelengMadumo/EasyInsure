import { Amplify } from 'aws-amplify';

// amplify_outputs.json only exists after a sandbox or pipeline deploy. Loading it optionally lets
// the demo run (npm run dev) on a machine with no backend at all.
const found = import.meta.glob('../amplify_outputs.json', { eager: true, import: 'default' });
const outputs = Object.values(found)[0] as Record<string, unknown> | undefined;
if (outputs) Amplify.configure(outputs);
