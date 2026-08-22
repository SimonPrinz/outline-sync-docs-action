export default class Api {
    /** @type {String} */
    #_baseUrl;
    /** @type {String} */
    #_apiKey;

    /**
     * @param baseUrl {String}
     * @param apiKey {String}
     */
    constructor(baseUrl, apiKey) {
        this.#_baseUrl = baseUrl;
        if (this.#_baseUrl.endsWith('/')) {
            this.#_baseUrl = this.#_baseUrl.substring(0, this.#_baseUrl.length - 1);
        }
        this.#_apiKey = apiKey;
    }

    async #sendRequest(endpoint, body = null) {
        const response = await fetch(`${this.#_baseUrl}${endpoint}`, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${this.#_apiKey}`,
                'Content-Type': 'application/json'
            },
            body: body ? JSON.stringify(body) : null
        });
        const json = await response.json();
        if (!json.ok) {
            throw new Error(`Failed to connect to Outline API. ${json.error}${(json.message ? ': ' + json.message : '')}`);
        }
        return json.data;
    }

    /**
     * @returns {Promise<{
     *    user: {email: String},
     *    team: {name: String}
     * }>}
     */
    authInfo() {
        return this.#sendRequest('/api/auth.info');
    }

    /**
     *
     * @param id {String}
     * @returns {Promise<{
     *     id: String,
     *     name: String,
     *     description: String|null
     * }>}
     */
    collectionsInfo(id) {
        return this.#sendRequest(
            '/api/collections.info',
            {id}
        );
    }

    /**
     * @param id {String}
     * @param name {String}
     * @param description {String}
     * @returns {Promise<{id: String, name: String, description: String}>}
     */
    collectionsUpdate({id, name, description}) {
        return this.#sendRequest(
            '/api/collections.update',
            {id, name, description}
        );
    }

    /**
     * @param id {String}
     * @returns {Promise<{
     *     id: String,
     *     title: String,
     *     text: String,
     *     archivedAt: String|null
     * }>}
     */
    documentsInfo(id) {
        return this.#sendRequest(
            '/api/documents.info',
            {id}
        );
    }

    /**
     * @param id {String}
     * @returns {Promise<{
     *     id: String,
     *     title: String,
     *     children: Array<{
     *         id: String,
     *         title: String,
     *             children: Array<{
     *             id: String,
     *             title: String
     *         }>
     *     }>
     * }>}
     */
    documentsDocuments(id) {
        return this.#sendRequest(
            '/api/documents.documents',
            {id}
        );
    }

    /**
     * @param id {String} collection id
     * @returns {Promise<Array<{
     *     id: String,
     *     title: String,
     *     children: Array<Object>
     * }>>}
     */
    collectionsDocuments(id) {
        return this.#sendRequest(
            '/api/collections.documents',
            {id}
        );
    }

    /**
     * @param title {String}
     * @param text {String}
     * @param collectionId {String}
     * @param parentDocumentId {String|null}
     * @returns {Promise<{id: String, title: String}>}
     */
    documentsCreate({title, text, collectionId, parentDocumentId = null}) {
        return this.#sendRequest(
            '/api/documents.create',
            {title, text, collectionId, parentDocumentId, publish: true}
        );
    }

    /**
     * @param id {String}
     * @param title {String}
     * @param text {String}
     * @returns {Promise<{id: String, title: String}>}
     */
    documentsUpdate({id, title, text}) {
        return this.#sendRequest(
            '/api/documents.update',
            {id, title, text}
        );
    }

    /**
     * @param id {String}
     * @returns {Promise<{id: String, archivedAt: String}>}
     */
    documentsArchive(id) {
        return this.#sendRequest(
            '/api/documents.archive',
            {id}
        );
    }

    /**
     * @param id {String}
     * @param collectionId {String}
     * @param parentDocumentId {String|null}
     * @returns {Promise<{id: String, parentDocumentId: String|null}>}
     */
    documentsMove({id, collectionId, parentDocumentId = null}) {
        return this.#sendRequest(
            '/api/documents.move',
            {id, collectionId, parentDocumentId}
        );
    }
}