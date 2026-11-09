import { randomBytes } from 'node:crypto';

/** Helpers for route-handler tests: build Web `Request`s and collect `after()` callbacks. */

export const uniqueIp = () => `203.0.113.${randomBytes(1)[0]}-${randomBytes(4).toString('hex')}`;

export function jsonRequest(url: string, body: unknown, init: { ip?: string; headers?: Record<string, string>; method?: string } = {}): Request {
  return new Request(`http://localhost${url}`, {
    method: init.method ?? 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': init.ip ?? uniqueIp(), ...init.headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

export function getRequest(url: string, init: { ip?: string; headers?: Record<string, string> } = {}): Request {
  return new Request(`http://localhost${url}`, { headers: { 'x-forwarded-for': init.ip ?? uniqueIp(), ...init.headers } });
}

/** Stand-in for `after()`: collects the callbacks so tests can assert and run them. */
export function afterCollector() {
  const tasks: (() => unknown)[] = [];
  return {
    scheduleAfter: (task: () => unknown) => {
      tasks.push(task);
    },
    tasks,
    runAll: async () => {
      for (const t of tasks.splice(0)) await t();
    },
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- test helper: assertions index freely into response JSON
type AnyJson = Record<string, any>;

export async function readJson(response: Response): Promise<AnyJson> {
  return (await response.json()) as AnyJson;
}
