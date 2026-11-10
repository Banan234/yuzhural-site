import { hashAdminPassword } from '../lib/adminAuth.js';
// Read from stdin so that the password never appears in shell history or argv.
let input = '';
for await (const chunk of process.stdin) input += chunk;
console.log(await hashAdminPassword(input.replace(/\r?\n$/, '')));
