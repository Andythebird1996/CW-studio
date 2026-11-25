import app from './app.ts';

const port = parseInt(process.env.PORT ?? '3001', 10);

console.log(`Backend running on http://localhost:${port}`);
// SOAP-kall mot Checkware-storen kan ta mer enn Buns standard på 10 s
// (spesielt publisering og nedlasting av store pakker). Maks er 255 s.
export default { port, fetch: app.fetch, idleTimeout: 240 };
