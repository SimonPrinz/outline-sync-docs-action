import {test} from "node:test";
import assert from "node:assert/strict";
import Api from "./api.js";

function mockFetch(t, handler) {
    const original = global.fetch;
    global.fetch = handler;
    t.after(() => {
        global.fetch = original;
    });
}

test("strips a trailing slash from baseUrl", async (t) => {
    let calledUrl;
    mockFetch(t, async (url) => {
        calledUrl = url;
        return {json: async () => ({ok: true, data: {}})};
    });

    const api = new Api("https://example.com/", "key");
    await api.authInfo();
    assert.equal(calledUrl, "https://example.com/api/auth.info");
});

test("sends a POST with bearer auth and a JSON body", async (t) => {
    let capturedOpts;
    mockFetch(t, async (url, opts) => {
        capturedOpts = opts;
        return {json: async () => ({ok: true, data: {id: "col-1"}})};
    });

    const api = new Api("https://example.com", "secret-key");
    await api.collectionsInfo("col-1");

    assert.equal(capturedOpts.method, "POST");
    assert.equal(capturedOpts.headers.Authorization, "Bearer secret-key");
    assert.equal(capturedOpts.headers["Content-Type"], "application/json");
    assert.deepEqual(JSON.parse(capturedOpts.body), {id: "col-1"});
});

test("throws with the API's error and message when ok is false", async (t) => {
    mockFetch(t, async () => ({
        json: async () => ({ok: false, error: "not_found", message: "Collection not found"})
    }));

    const api = new Api("https://example.com", "key");
    await assert.rejects(() => api.collectionsInfo("missing"), /not_found: Collection not found/);
});

test("documentsCreate always publishes and defaults parentDocumentId to null", async (t) => {
    let capturedBody;
    mockFetch(t, async (url, opts) => {
        capturedBody = JSON.parse(opts.body);
        return {json: async () => ({ok: true, data: {id: "new-1"}})};
    });

    const api = new Api("https://example.com", "key");
    await api.documentsCreate({title: "T", text: "body", collectionId: "col-1"});

    assert.equal(capturedBody.publish, true);
    assert.equal(capturedBody.parentDocumentId, null);
});
