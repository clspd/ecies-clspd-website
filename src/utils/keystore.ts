import { openDB, type DBSchema, type IDBPDatabase } from "idb";

import { isCurve, type Curve } from "@/utils/cryptoconfig";
import { normalizeHex, validateKey, DEFAULT_CURVE, type KeyKind } from "@/utils/keys";

export const KEY_DB_NAME = "ecies-web";
export const KEY_DB_VERSION = 1;
export const KEY_STORE_NAME = "keys";

export interface StoredKey {
    id: string;
    name: string;
    kind: KeyKind;
    curve: string;
    /** Raw key bytes as lowercase hex (32 bytes private; public is 33 bytes compressed on secp256k1, 32 bytes on x25519/ed25519). */
    hex: string;
    createdAt: number;
    updatedAt: number;
}

export interface StoredKeyInput {
    name?: string;
    kind: KeyKind;
    hex: string;
    curve?: Curve;
    /** Updates an existing record when present, creates a new one otherwise. */
    id?: string;
}

export interface ListKeysOptions {
    kind?: KeyKind;
    search?: string;
}

interface KeyDB extends DBSchema {
    keys: {
        key: string;
        value: StoredKey;
        indexes: {
            kind: KeyKind;
            createdAt: number;
            kindHex: [KeyKind, string];
        };
    };
}

/** Any failure while talking to IndexedDB, with a message safe to show in the UI. */
export class KeyStoreError extends Error {
    constructor(message: string, options?: { cause?: unknown }) {
        super(message, options);
        this.name = "KeyStoreError";
    }
}

/** Raised when a key with the same kind and key material already exists in the library. */
export class DuplicateKeyError extends KeyStoreError {
    readonly existing: StoredKey;

    constructor(existing: StoredKey) {
        super(`This ${existing.kind} key already exists in your key library ("${existing.name}")`);
        this.name = "DuplicateKeyError";
        this.existing = existing;
    }
}

let dbPromise: Promise<IDBPDatabase<KeyDB>> | null = null;

const openKeyDB = (): Promise<IDBPDatabase<KeyDB>> => {
    if (!dbPromise) {
        dbPromise = openDB<KeyDB>(KEY_DB_NAME, KEY_DB_VERSION, {
            upgrade(db) {
                const store = db.createObjectStore(KEY_STORE_NAME, { keyPath: "id" });
                store.createIndex("kind", "kind");
                store.createIndex("createdAt", "createdAt");
                store.createIndex("kindHex", ["kind", "hex"], { unique: true });
            },
        }).catch((err: unknown) => {
            dbPromise = null;
            throw new KeyStoreError(describeDbError(err), { cause: err });
        });
    }
    return dbPromise;
};

const describeDbError = (err: unknown): string => {
    const name = err instanceof Error ? err.name : "";
    if (name === "SecurityError" || name === "InvalidStateError") {
        return "IndexedDB is not available in this browser context (private browsing may block it)";
    }
    if (name === "QuotaExceededError") {
        return "The browser storage quota is exhausted, so the key library cannot be written";
    }
    return "Key library storage error: " + String(err);
};

const wrap = async <T>(operation: () => Promise<T>, fallback: string): Promise<T> => {
    try {
        return await operation();
    } catch (err) {
        if (err instanceof KeyStoreError) throw err;
        throw new KeyStoreError(fallback + ": " + String(err), { cause: err });
    }
};

const normalizeName = (name: string | undefined, fallback = "Untitled key"): string => {
    if (name === undefined || name === "") return fallback;
    return name.slice(0, 100);
};

const defaultNameFor = (kind: KeyKind): string => {
    const stamp = new Date().toISOString().replace("T", " ").slice(0, 19);
    return `${kind === "private" ? "Private" : "Public"} key ${stamp}`;
};

/** Lists stored keys, newest first. */
export function listKeys(options: ListKeysOptions = {}): Promise<StoredKey[]> {
    return wrap(async () => {
        const db = await openKeyDB();
        const all = await db.getAllFromIndex(KEY_STORE_NAME, "createdAt");
        const sorted = all.slice().sort((a, b) => b.createdAt - a.createdAt);
        const kind = options.kind;
        const search = (options.search ?? "").toLowerCase();
        return sorted.filter((key) => {
            if (kind && key.kind !== kind) return false;
            if (search && !key.name.toLowerCase().includes(search) && !key.hex.includes(search)) return false;
            return true;
        });
    }, "Cannot read the key library");
}

/** Reads one stored key, or `undefined` when it does not exist. */
export function getKey(id: string): Promise<StoredKey | undefined> {
    return wrap(async () => {
        const db = await openKeyDB();
        return await db.get(KEY_STORE_NAME, id);
    }, "Cannot read the key library");
}

/** Creates a new record, or updates an existing one when `id` is given. */
export function saveKey(input: StoredKeyInput): Promise<StoredKey> {
    return wrap(async () => {
        const hex = normalizeHex(input.hex);
        const db = await openKeyDB();
        const now = Date.now();

        if (input.id) {
            const existing = await db.get(KEY_STORE_NAME, input.id);
            if (!existing) throw new KeyStoreError("This key no longer exists in your key library");
            const curve = input.curve ?? (isCurve(existing.curve) ? existing.curve : DEFAULT_CURVE);
            const validation = validateKey(input.kind, hex, curve);
            if (!validation.ok) throw new KeyStoreError(validation.reason ?? "Invalid key");
            const kind = input.kind === existing.kind ? existing.kind : input.kind;
            const isSameMaterial = kind === existing.kind && hex === existing.hex;
            if (!isSameMaterial) {
                const conflict = await db.getFromIndex(KEY_STORE_NAME, "kindHex", [kind, hex]);
                if (conflict && conflict.id !== input.id) throw new DuplicateKeyError(conflict);
            }
            const updated: StoredKey = {
                ...existing,
                name: normalizeName(input.name, existing.name || defaultNameFor(kind)),
                kind,
                hex: isSameMaterial ? existing.hex : hex,
                curve,
                updatedAt: now,
            };
            await db.put(KEY_STORE_NAME, updated);
            return updated;
        }

        const curve = input.curve ?? DEFAULT_CURVE;
        const validation = validateKey(input.kind, hex, curve);
        if (!validation.ok) throw new KeyStoreError(validation.reason ?? "Invalid key");

        const conflict = await db.getFromIndex(KEY_STORE_NAME, "kindHex", [input.kind, hex]);
        if (conflict) throw new DuplicateKeyError(conflict);

        const record: StoredKey = {
            id: createKeyId(),
            name: normalizeName(input.name, defaultNameFor(input.kind)),
            kind: input.kind,
            hex,
            curve,
            createdAt: now,
            updatedAt: now,
        };
        await db.put(KEY_STORE_NAME, record);
        return record;
    }, "Cannot save to the key library");
}

/**
 * Writes the private record first. The matching public key is written as well unless an
 * identical one is already stored; a failure there is reported instead of losing the key.
 */
export function saveGeneratedKeyPair(
    pair: { privateHex: string; publicHex: string },
    name?: string,
    curve: Curve = DEFAULT_CURVE,
): Promise<{ privateKey: StoredKey; publicKey?: StoredKey; publicKeyError?: string }> {
    return wrap(async () => {
        const privateKey = await saveKey({ kind: "private", hex: pair.privateHex, name, curve });
        const db = await openKeyDB();
        const existingPublic = await db.getFromIndex(KEY_STORE_NAME, "kindHex", ["public", pair.publicHex]);
        if (existingPublic) return { privateKey };
        try {
            const publicKey = await saveKey({ kind: "public", hex: pair.publicHex, name, curve });
            return { privateKey, publicKey };
        } catch (err) {
            return { privateKey, publicKeyError: String(err instanceof Error ? err.message : err) };
        }
    }, "Cannot save the generated key pair");
}

export function renameKey(id: string, name: string): Promise<StoredKey> {
    return wrap(async () => {
        const db = await openKeyDB();
        const existing = await db.get(KEY_STORE_NAME, id);
        if (!existing) throw new KeyStoreError("This key no longer exists in your key library");
        const updated: StoredKey = {
            ...existing,
            name: normalizeName(name, existing.name || defaultNameFor(existing.kind)),
            updatedAt: Date.now(),
        };
        await db.put(KEY_STORE_NAME, updated);
        return updated;
    }, "Cannot rename the key");
}

export function deleteKey(id: string): Promise<void> {
    return wrap(async () => {
        const db = await openKeyDB();
        await db.delete(KEY_STORE_NAME, id);
    }, "Cannot delete the key");
}

const createKeyId = (): string => {
    const cryptoApi = globalThis.crypto;
    if (cryptoApi && typeof cryptoApi.randomUUID === "function") return cryptoApi.randomUUID();
    return "key-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 10);
};
