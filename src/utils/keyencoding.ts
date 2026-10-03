import bs58 from "bs58";
import LZString from "lz-string";

export type KeyEncoding = "hex" | "base64" | "base58" | "lz-string";

export const KEY_ENCODINGS: readonly KeyEncoding[] = ["hex", "base64", "base58", "lz-string"];

export const KEY_ENCODING_LABELS: Record<KeyEncoding, string> = {
    "hex": "Hex",
    "base64": "Base64",
    "base58": "Base58",
    "lz-string": "LZ-String",
};

const hexTable: string[] = (() => {
    const table: string[] = [];
    for (let i = 0; i < 256; i++) table.push(i.toString(16).padStart(2, "0"));
    return table;
})();

export function isKeyEncoding(value: unknown): value is KeyEncoding {
    return typeof value === "string" && (KEY_ENCODINGS as readonly string[]).includes(value);
}

export function encodeBase64(bytes: Uint8Array): string {
    let binary = "";
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return btoa(binary);
}

export function decodeBase64(text: string): Uint8Array {
    const binary = atob(text);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
}

export function encodeHexString(bytes: Uint8Array): string {
    const parts: string[] = [];
    for (const byte of bytes) parts.push(hexTable[byte] ?? "00");
    return parts.join("");
}

const HEX_CHAR = /^[0-9a-fA-F]$/;

/** Parses hex bytes, skipping whitespace between digits and an optional `0x` prefix. */
export function decodeHexString(hex: string): Uint8Array {
    const text = hex.replace(/^0x/i, "");
    const bytes: number[] = [];
    let pending = -1;
    for (const char of text) {
        if (char === " " || char === "\t" || char === "\n" || char === "\r" || char === "\f" || char === "\v") {
            continue;
        }
        if (!HEX_CHAR.test(char)) throw new TypeError(`Invalid hex character: ${JSON.stringify(char)}`);
        const value = Number.parseInt(char, 16);
        if (pending < 0) {
            pending = value;
        } else {
            bytes.push((pending << 4) | value);
            pending = -1;
        }
    }
    if (pending >= 0) throw new TypeError("Hex string must have an even number of digits");
    return new Uint8Array(bytes);
}

/** Encodes raw key bytes with one of the four supported encodings. */
export function encodeBytes(bytes: Uint8Array, encoding: KeyEncoding): string {
    switch (encoding) {
        case "base64":
            return encodeBase64(bytes);
        case "base58":
            return bs58.encode(bytes);
        case "lz-string":
            return LZString.compressToBase64(encodeBase64(bytes));
        default:
            return encodeHexString(bytes);
    }
}

/** Decodes a user supplied string with one of the four supported encodings. */
export function decodeBytes(text: string, encoding: KeyEncoding): Uint8Array {
    switch (encoding) {
        case "base64":
            return decodeBase64(text);
        case "base58":
            return bs58.decode(text);
        case "lz-string": {
            const decompressed = LZString.decompressFromBase64(text);
            if (typeof decompressed !== "string") throw new TypeError("Invalid LZ-String content");
            return decodeBase64(decompressed);
        }
        default:
            return decodeHexString(text);
    }
}

/** Re-encodes raw key hex into the requested encoding. */
export function encodeHex(hex: string, encoding: KeyEncoding): string {
    return encodeBytes(decodeHexString(hex), encoding);
}

/** Decodes user supplied key content back into raw key hex. */
export function decodeToHex(text: string, encoding: KeyEncoding): string {
    return encodeHexString(decodeBytes(text, encoding));
}
