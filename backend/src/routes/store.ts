import { Hono } from 'hono';
import {
  clearEndpointCache,
  retreiveAvailablePackages,
  retreivePackage,
  validatePackage,
  publishPackage,
  type SoapConfig,
} from '../soap/client.ts';

const store = new Hono();

/** Build config from request headers (frontend passes credentials per-request) */
function getConfig(c: any): SoapConfig {
  return {
    wsdlUrl: c.req.header('X-Store-Url') ?? process.env.STORE_WSDL_URL ?? '',
    user: c.req.header('X-Store-User') ?? process.env.STORE_USER ?? '',
    password: c.req.header('X-Store-Password') ?? process.env.STORE_PASSWORD ?? '',
  };
}

/** List all available packages on the server */
store.get('/packages', async (c) => {
  try {
    const packages = await retreiveAvailablePackages(getConfig(c));
    return c.json(packages);
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

/** Download a specific package by UID */
store.get('/packages/:uid', async (c) => {
  try {
    const uid = parseInt(c.req.param('uid'), 10);
    const pkg = await retreivePackage(getConfig(c), uid);
    return c.json(pkg);
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

/** Validate a package before publishing */
store.post('/validate', async (c) => {
  try {
    const body = await c.req.json();
    const result = await validatePackage(getConfig(c), body);
    return c.json(result);
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

/** Publish a package to the server */
store.post('/publish', async (c) => {
  try {
    const body = await c.req.json();
    const ok = await publishPackage(getConfig(c), body);
    return c.json({ success: ok });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

/** Clear the cached SOAP endpoint (call after changing server URL) */
store.post('/clear-cache', (c) => {
  clearEndpointCache();
  return c.json({ ok: true });
});

export default store;
