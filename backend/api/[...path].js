import app from "../src/index.js";

export default {
  async fetch(request) {
    const env = {
      AIRTABLE_API_URL: process.env.AIRTABLE_API_URL,
      AIRTABLE_BASE_ID: process.env.AIRTABLE_BASE_ID,
      AIRTABLE_API_KEY: process.env.AIRTABLE_API_KEY,
      ALLOWED_ORIGINS: process.env.ALLOWED_ORIGINS,
    };

    return app.fetch(request, env, {});
  },
};