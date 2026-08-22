import {test} from "node:test";
import assert from "node:assert/strict";
import {flattenIds, indexRemoteTree, buildPlan, executePlan} from "./plan.js";

function makeFakeOutline(initialDocs) {
    const docs = new Map(initialDocs.map(doc => [doc.id, {...doc}]));
    const calls = {create: [], update: [], move: []};
    let counter = 0;

    return {
        calls,
        async documentsInfo(id) {
            return docs.get(id);
        },
        async documentsCreate({title, text, parentDocumentId}) {
            const id = `new-${++counter}`;
            docs.set(id, {id, title, text, parentId: parentDocumentId});
            calls.create.push({title, parentDocumentId});
            return {id, title};
        },
        async documentsUpdate({id, title, text}) {
            docs.set(id, {...docs.get(id), title, text});
            calls.update.push({id, title, text});
            return {id, title};
        },
        async documentsMove({id, parentDocumentId}) {
            docs.set(id, {...docs.get(id), parentId: parentDocumentId});
            calls.move.push({id, parentDocumentId});
            return {id};
        }
    };
}

test("flattenIds collects every id in a nested tree", () => {
    const tree = [{id: "a", title: "A", children: [{id: "b", title: "B", children: []}]}];
    assert.deepEqual(flattenIds(tree), ["a", "b"]);
});

test("indexRemoteTree records each node's parent and groups by title", () => {
    const tree = [{id: "a", title: "A", children: [{id: "b", title: "B", children: []}]}];
    const byId = new Map();
    const byTitle = new Map();
    indexRemoteTree(tree, null, byId, byTitle);
    assert.equal(byId.get("a").parentId, null);
    assert.equal(byId.get("b").parentId, "a");
    assert.deepEqual(byTitle.get("A"), ["a"]);
    assert.deepEqual(byTitle.get("B"), ["b"]);
});

test("buildPlan: no match anywhere -> create", async () => {
    const outline = makeFakeOutline([]);
    const localNodes = [{type: "file", title: "New", body: "content"}];
    const plan = await buildPlan(localNodes, [], outline, new Map(), new Map(), new Set());
    assert.equal(plan[0].remoteId, null);
    assert.equal(plan[0].contentChanged, false);
});

test("buildPlan: matched pair, identical content -> no change", async () => {
    const outline = makeFakeOutline([{id: "x", title: "Doc", text: "same", parentId: null}]);
    const remoteTree = [{id: "x", title: "Doc", children: []}];
    const byId = new Map(), byTitle = new Map();
    indexRemoteTree(remoteTree, null, byId, byTitle);

    const localNodes = [{type: "file", title: "Doc", body: "same"}];
    const plan = await buildPlan(localNodes, remoteTree, outline, byId, byTitle, new Set());
    assert.equal(plan[0].remoteId, "x");
    assert.equal(plan[0].contentChanged, false);
});

test("buildPlan: matched pair, different content -> flagged changed", async () => {
    const outline = makeFakeOutline([{id: "x", title: "Doc", text: "old", parentId: null}]);
    const remoteTree = [{id: "x", title: "Doc", children: []}];
    const byId = new Map(), byTitle = new Map();
    indexRemoteTree(remoteTree, null, byId, byTitle);

    const localNodes = [{type: "file", title: "Doc", body: "new"}];
    const plan = await buildPlan(localNodes, remoteTree, outline, byId, byTitle, new Set());
    assert.equal(plan[0].contentChanged, true);
});

test("buildPlan: unambiguous move is resolved via the global fallback", async () => {
    const remoteTree = [
        {id: "folderA", title: "A", children: [{id: "fileX", title: "Doc", children: []}]},
        {id: "folderB", title: "B", children: []}
    ];
    const outline = makeFakeOutline([
        {id: "folderA", title: "A", text: "", parentId: null},
        {id: "folderB", title: "B", text: "", parentId: null},
        {id: "fileX", title: "Doc", text: "same", parentId: "folderA"}
    ]);
    const byId = new Map(), byTitle = new Map();
    indexRemoteTree(remoteTree, null, byId, byTitle);

    const localNodes = [
        {type: "folder", title: "B", body: "", children: [{type: "file", title: "Doc", body: "same"}]}
    ];
    const plan = await buildPlan(localNodes, remoteTree, outline, byId, byTitle, new Set());
    const moved = plan[0].children[0];
    assert.equal(moved.remoteId, "fileX");
    assert.equal(moved.currentParentId, "folderA");

    await executePlan(plan, null, outline, "collection-1");
    assert.deepEqual(outline.calls.move, [{id: "fileX", parentDocumentId: "folderB"}]);
});

test("buildPlan: ambiguous title (multiple unclaimed candidates) falls back to create", async () => {
    const remoteTree = [
        {id: "d1", title: "Setup", children: []},
        {id: "d2", title: "Setup", children: []}
    ];
    const outline = makeFakeOutline([
        {id: "d1", title: "Setup", text: "one", parentId: null},
        {id: "d2", title: "Setup", text: "two", parentId: null}
    ]);
    const byId = new Map(), byTitle = new Map();
    indexRemoteTree(remoteTree, null, byId, byTitle);

    const localNodes = [
        {type: "folder", title: "New Folder", body: "", children: [{type: "file", title: "Setup", body: "three"}]}
    ];
    const plan = await buildPlan(localNodes, remoteTree, outline, byId, byTitle, new Set());
    assert.equal(plan[0].children[0].remoteId, null);
});

test("executePlan: create calls documentsCreate with the resolved parent", async () => {
    const outline = makeFakeOutline([]);
    const plan = [{type: "file", title: "New", text: "content", remoteId: null, currentParentId: null, contentChanged: false, children: []}];
    await executePlan(plan, "parent-1", outline, "collection-1");
    assert.deepEqual(outline.calls.create, [{title: "New", parentDocumentId: "parent-1"}]);
});

test("executePlan: same parent and unchanged content makes no calls", async () => {
    const outline = makeFakeOutline([{id: "x", title: "Doc", text: "same", parentId: "parent-1"}]);
    const plan = [{type: "file", title: "Doc", text: "same", remoteId: "x", currentParentId: "parent-1", contentChanged: false, children: []}];
    await executePlan(plan, "parent-1", outline, "collection-1");
    assert.deepEqual(outline.calls, {create: [], update: [], move: []});
});

test("executePlan: contentChanged triggers an update", async () => {
    const outline = makeFakeOutline([{id: "x", title: "Doc", text: "old", parentId: "parent-1"}]);
    const plan = [{type: "file", title: "Doc", text: "new", remoteId: "x", currentParentId: "parent-1", contentChanged: true, children: []}];
    await executePlan(plan, "parent-1", outline, "collection-1");
    assert.deepEqual(outline.calls.update, [{id: "x", title: "Doc", text: "new"}]);
});
