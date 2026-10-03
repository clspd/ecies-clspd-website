import { PrivateKey, PublicKey } from "eciesjs";
import { DEFAULT_CURVE, type Curve } from "@/utils/cryptoconfig";

export type KeyKind = "public" | "private";

export { DEFAULT_CURVE };

export const KEY_KIND_LABELS: Record<KeyKind, string> = {
    public: "Public key",
    private: "Private key",
};

export interface KeyPairHex {
    /** Hex of the private scalar (32 bytes). */
    privateHex: string;
    /** Hex of the public key (33 bytes compressed on secp256k1, 32 bytes on x25519/ed25519). */
    publicHex: string;
}

export interface KeyValidationResult {
    ok: boolean;
    reason?: string;
}

/** Generates a fresh random key pair for the given curve. */
export function generateKeyPair(curve: Curve = DEFAULT_CURVE): KeyPairHex {
    const secret = new PrivateKey(undefined, curve);
    return {
        privateHex: secret.toHex(),
        publicHex: secret.publicKey.toHex(),
    };
}

/** Drops an optional `0x` prefix and lowercases the result. */
export function normalizeHex(text: string): string {
    return text.replace(/^0x/i, "").toLowerCase();
}

/** Derives the public key hex belonging to a private key hex. */
export function derivePublicHex(privateHex: string, curve: Curve = DEFAULT_CURVE): string {
    return PrivateKey.fromHex(normalizeHex(privateHex), curve).publicKey.toHex();
}

/** Validates key material for the given kind and curve. */
export function validateKey(kind: KeyKind, hex: string, curve: Curve = DEFAULT_CURVE): KeyValidationResult {
    const normalized = normalizeHex(hex).replace(/[\t\n\r\f\v ]+/g, "");
    if (!normalized) return { ok: false, reason: "Key content is empty" };
    if (normalized.length % 2 !== 0) return { ok: false, reason: "Hex string must have an even number of digits" };
    if (!/^[0-9a-f]+$/.test(normalized)) return { ok: false, reason: "Key content must be hexadecimal" };

    try {
        if (kind === "private") {
            const privateKey = PrivateKey.fromHex(normalized, curve);
            if (privateKey.toHex() !== normalized) {
                return { ok: false, reason: `Not a valid ${curve} private key` };
            }
        } else {
            const publicKey = PublicKey.fromHex(normalized, curve);
            if (publicKey.toHex() !== normalized) {
                return { ok: false, reason: `Not a valid compressed ${curve} public key` };
            }
        }
    } catch (err) {
        return { ok: false, reason: `Not a valid ${curve} ${kind} key: ${String(err)}` };
    }
    return { ok: true };
}
