import { describe, expect, it } from "vitest";
import { Client, HttpConnection } from "@elastic/elasticsearch";

describe("Elasticsearch proxy connection", () => {
  it("can construct a client with a proxy by using HttpConnection", async () => {
    const client = new Client({
      node: "https://es.example.com:9200",
      proxy: "http://proxy.example.com:8080",
      Connection: HttpConnection,
    });

    expect(client).toBeInstanceOf(Client);
    await client.close();
  });

  it("documents the regression: the default Undici connection rejects proxies", () => {
    expect(() => new Client({
      node: "https://es.example.com:9200",
      proxy: "http://proxy.example.com:8080",
    })).toThrow("Undici connection can't work with proxies");
  });
});
