import app from "../src/index.js";

export default async function handler(req, res) {
  try {
    const env = {
      AIRTABLE_API_URL: process.env.AIRTABLE_API_URL,
      AIRTABLE_BASE_ID: process.env.AIRTABLE_BASE_ID,
      AIRTABLE_API_KEY: process.env.AIRTABLE_API_KEY,
      ALLOWED_ORIGINS: process.env.ALLOWED_ORIGINS,
    };

    const headers = new Headers(req.headers);
    headers.delete("host");
    headers.delete("content-length");
    headers.delete("connection");

    let body;

    if (!["GET", "HEAD"].includes(req.method) && req.body !== undefined) {
      body = typeof req.body === "string"
        ? req.body
        : JSON.stringify(req.body);
    }

    const requestUrl = new URL(
      req.url,
      `http://${req.headers.host || "localhost"}`
    );

    requestUrl.searchParams.delete("...path");

    const request = new Request(requestUrl, {
      method: req.method,
      headers,
      body,
    });
    const response = await app.fetch(request, env, {});

    res.statusCode = response.status;

    response.headers.forEach((value, key) => {
      res.setHeader(key, value);
    });

    const responseBody = await response.arrayBuffer();
    res.end(Buffer.from(responseBody));

  } catch (error) {
    console.error("Vercel adapter error:", error);
    res.statusCode = 500;
    res.end(JSON.stringify({ error: "Internal server error" }));
  }
}
