import { Config } from "eciesjs/config";

export type Curve = "secp256k1" | "x25519" | "ed25519";
export type Cipher = "aes-256-gcm" | "xchacha20";

export const CURVES: readonly Curve[] = ["secp256k1", "x25519", "ed25519"];
export const CIPHERS: readonly Cipher[] = ["aes-256-gcm", "xchacha20"];

export const CURVE_LABELS: Record<Curve, string> = {
    secp256k1: "secp256k1",
    x25519: "x25519",
    ed25519: "ed25519",
};

export const CIPHER_LABELS: Record<Cipher, string> = {
    "aes-256-gcm": "aes-256-gcm",
    xchacha20: "xchacha20",
};

export const DEFAULT_CURVE: Curve = "x25519";
export const DEFAULT_CIPHER: Cipher = "aes-256-gcm";

export function isCurve(value: unknown): value is Curve {
    return typeof value === "string" && (CURVES as readonly string[]).includes(value);
}

export function isCipher(value: unknown): value is Cipher {
    return typeof value === "string" && (CIPHERS as readonly string[]).includes(value);
}

/** Builds an explicit per-call config so library default drift cannot change behavior. */
export function buildConfig(curve: Curve, cipher: Cipher): Config {
    const config = new Config();
    config.ellipticCurve = curve;
    config.symmetricAlgorithm = cipher;
    config.isEphemeralKeyCompressed = false;
    config.isHkdfKeyCompressed = false;
    config.symmetricNonceLength = 16;
    return config;
}
