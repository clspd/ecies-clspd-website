import { PrivateKey, PublicKey } from "eciesjs";

export type KeyKind = "public" | "private";

export const DEFAULT_CURVE = "secp256k1";

export const KEY_KIND_LABELS: Record<KeyKind, string> = {
    public: "Public key",
    private: "Private key",
};

export interface KeyPairHex {
    /** Hex of the private scalar (32 bytes). */
    privateHex: string;
    /** Hex of the compressed public key (33 bytes). */
    publicHex: string;
}

export interface KeyValidationResult {
    ok: boolean;
    reason?: string;
}

/** Generates a fresh random secp256k1 key pair. */
export function generateKeyPair(): KeyPairHex {
    const secret = new PrivateKey();
    return {
        privateHex: secret.toHex(),
        publicHex: secret.publicKey.toHex(),
    };
}

/** Drops an optional `0x` prefix and lowercases the result. */
export function normalizeHex(text: string): string {
    return text.replace(/^0x/i, "").toLowerCase();
}

/** Derives the compressed public key hex belonging to a private key hex. */
export function derivePublicHex(privateHex: string): string {
    return PrivateKey.fromHex(normalizeHex(privateHex)).publicKey.toHex();
}

/** Validates key material for the given kind (secp256k1). */
export function validateKey(kind: KeyKind, hex: string): KeyValidationResult {
    const normalized = normalizeHex(hex).replace(/[\t\n\r\f\v ]+/g, "");
    if (!normalized) return { ok: false, reason: "Key content is empty" };
    if (normalized.length % 2 !== 0) return { ok: false, reason: "Hex string must have an even number of digits" };
    if (!/^[0-9a-f]+$/.test(normalized)) return { ok: false, reason: "Key content must be hexadecimal" };

    try {
        if (kind === "private") {
            const privateKey = PrivateKey.fromHex(normalized);
            if (privateKey.toHex() !== normalized) {
                return { ok: false, reason: `Not a valid ${DEFAULT_CURVE} private key` };
            }
        } else {
            const publicKey = PublicKey.fromHex(normalized);
            if (publicKey.toHex() !== normalized) {
                return { ok: false, reason: `Not a valid compressed ${DEFAULT_CURVE} public key` };
            }
        }
    } catch (err) {
        return { ok: false, reason: `Not a valid ${DEFAULT_CURVE} ${kind} key: ${String(err)}` };
    }
    return { ok: true };
}
