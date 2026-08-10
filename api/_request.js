export async function readJsonBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string") return JSON.parse(req.body || "{}");

  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString("utf8");
  const body = raw ? JSON.parse(raw) : {};
  req.body = body;
  return body;
}

export async function readRequestParams(req) {
  const query = req.query || {};
  if (req.method !== "POST") return query;

  const body = await readJsonBody(req);
  const params = body?.params && typeof body.params === "object" ? body.params : body;
  return { ...query, ...params };
}

export function isTruthyParam(value) {
  return value === "1" || value === "true" || value === true;
}
