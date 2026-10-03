<template>
    <dialog-view v-model="open" class="request">
        <template #title>Choose a key</template>

        <div class="body">
            <a-segmented v-model:value="kind" block :options="kindOptions" />
            <div class="hint">{{ kindHint }}</div>

            <a-radio-group v-model:value="mode">
                <a-radio value="select">Choose from my key library</a-radio>
                <a-radio value="generate">Generate a new key</a-radio>
            </a-radio-group>

            <div class="format-row">
                <span class="format-label">Output encoding</span>
                <a-select v-model:value="encoding" :options="encodingOptions" style="width: 10em" />
            </div>

            <template v-if="mode === 'select'">
                <div v-if="loading" class="state">Loading your keys…</div>
                <a-alert v-else-if="loadError" type="error" show-icon :message="loadError">
                    <template #action>
                        <a-button size="small" @click="loadAvailableKeys">Retry</a-button>
                    </template>
                </a-alert>
                <a-empty
                    v-else-if="!availableKeys.length"
                    description="You have no stored key of this type"
                >
                    <a-button type="primary" @click="mode = 'generate'">Generate one instead</a-button>
                </a-empty>
                <a-radio-group v-else v-model:value="selectedId" class="key-list">
                    <a-radio v-for="key in availableKeys" :key="key.id" :value="key.id" class="key-option">
                        <span class="key-option-name">{{ key.name }}</span>
                        <span class="key-option-hex">{{ maskKey(key.hex) }}</span>
                    </a-radio>
                </a-radio-group>

                <div class="library-row">
                    <a-button @click="libraryOpen = true">Manage key library…</a-button>
                </div>
            </template>

            <template v-else>
                <div class="hint">
                    This key pair is generated locally in your browser and is not saved unless you ask for it.
                    Copy the private key if you need it later.
                </div>
                <template v-if="generated">
                    <key-display
                        label="Public key (encrypt)"
                        :value="preview(generated.publicHex)"
                        :meta="`${generated.publicHex.length / 2} bytes`"
                    />
                    <key-display
                        label="Private key (decrypt)"
                        secret
                        :value="generated.privateHex"
                        :meta="`${generated.privateHex.length / 2} bytes`"
                    />
                </template>
                <a-checkbox v-model:checked="saveToLibrary">Also save this key pair to my key library</a-checkbox>
                <a-input
                    v-if="saveToLibrary"
                    v-model:value="newKeyName"
                    :maxlength="100"
                    :placeholder="defaultGeneratedName"
                />
            </template>
        </div>

        <template #footer>
            <div class="footer">
                <a-button @click="onCancel">Cancel</a-button>
                <a-button type="primary" :disabled="!activeHex" :loading="confirming" @click="onConfirm">
                    Use this key
                </a-button>
            </div>
        </template>

        <key-library-dialog
            v-model:open="libraryOpen"
            request-open
            :curve="curve"
            @changed="loadAvailableKeys"
            @saved="loadAvailableKeys"
            @use="onLibraryUse"
        />
    </dialog-view>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import {
    Alert as AAlert,
    Button as AButton,
    Checkbox as ACheckbox,
    Empty as AEmpty,
    Input as AInput,
    Radio as ARadio,
    RadioGroup as ARadioGroup,
    Segmented as ASegmented,
    Select as ASelect,
    message,
} from 'ant-design-vue';
import { DialogView } from 'vue-dialog-view';

import KeyDisplay from '@/components/KeyDisplay.vue';
import KeyLibraryDialog from '@/components/KeyLibraryDialog.vue';
import { KEY_ENCODINGS, KEY_ENCODING_LABELS, encodeHex, type KeyEncoding } from '@/utils/keyencoding';
import {
    KeyStoreError,
    listKeys,
    saveGeneratedKeyPair,
    type StoredKey,
} from '@/utils/keystore';
import { generateKeyPair, type KeyKind, type KeyPairHex } from '@/utils/keys';
import { DEFAULT_CURVE, type Curve } from '@/utils/cryptoconfig';

export interface KeyRequestResult {
    content: string;
    hex: string;
    encoding: KeyEncoding;
    kind: KeyKind;
    curve: string;
    temporary: boolean;
    saved: boolean;
    name?: string;
    source: "stored" | "generated";
}

const props = withDefaults(defineProps<{
    open: boolean;
    kind?: KeyKind;
    encoding?: KeyEncoding;
    curve?: Curve;
}>(), {
    kind: "public",
    encoding: "hex",
    curve: DEFAULT_CURVE,
});

const emit = defineEmits<{
    (e: 'update:open', value: boolean): void;
    (e: 'ok', payload: KeyRequestResult): void;
    (e: 'cancel'): void;
}>();

const open = computed({
    get: () => props.open,
    set: (value: boolean) => {
        emit('update:open', value);
    },
});

type Mode = "select" | "generate";

const kind = ref<KeyKind>(props.kind);
const mode = ref<Mode>("select");
const encoding = ref<KeyEncoding>(props.encoding);
const availableKeys = ref<StoredKey[]>([]);
const selectedId = ref("");
const loading = ref(false);
const loadError = ref("");
const generated = ref<KeyPairHex | null>(null);
const saveToLibrary = ref(false);
const newKeyName = ref("");
const confirming = ref(false);
const libraryOpen = ref(false);

const kindOptions: { label: string; value: KeyKind }[] = [
    { label: "Public key — for encryption", value: "public" },
    { label: "Private key — for decryption", value: "private" },
];

const encodingOptions = KEY_ENCODINGS.map((value) => ({ value, label: KEY_ENCODING_LABELS[value] }));

const kindHint = computed(() =>
    kind.value === "public"
        ? "Public keys are used to encrypt data."
        : "Private keys are used to decrypt data.",
);

const defaultGeneratedName = computed(() =>
    kind.value === "private" ? "Generated private key" : "Generated public key",
);

const selectedKey = computed(() => availableKeys.value.find((key) => key.id === selectedId.value));

const preview = (hex: string): string => {
    try {
        return encodeHex(hex, encoding.value);
    } catch {
        return hex;
    }
};

const requestContent = computed(() => {
    if (mode.value === "select") {
        const key = selectedKey.value;
        if (!key) return "";
        return encodeHex(key.hex, encoding.value);
    }
    if (!generated.value) return "";
    const target = kind.value === "private" ? generated.value.privateHex : generated.value.publicHex;
    return encodeHex(target, encoding.value);
});

const activeHex = computed(() => {
    if (mode.value === "select") return selectedKey.value?.hex ?? "";
    if (!generated.value) return "";
    return kind.value === "private" ? generated.value.privateHex : generated.value.publicHex;
});

const maskKey = (hex: string): string => {
    if (hex.length <= 18) return hex;
    return hex.slice(0, 10) + "…" + hex.slice(-8);
};

const loadAvailableKeys = async () => {
    loading.value = true;
    loadError.value = "";
    try {
        availableKeys.value = await listKeys({ kind: kind.value });
        if (!availableKeys.value.some((key) => key.id === selectedId.value)) {
            selectedId.value = availableKeys.value[0]?.id ?? "";
        }
    } catch (err) {
        availableKeys.value = [];
        selectedId.value = "";
        loadError.value = err instanceof Error ? err.message : String(err);
    } finally {
        loading.value = false;
    }
};

const ensureGenerated = () => {
    if (!generated.value) generated.value = generateKeyPair(props.curve);
};

watch(
    () => props.open,
    (isOpen) => {
        if (!isOpen) return;
        kind.value = props.kind;
        encoding.value = props.encoding;
        mode.value = "select";
        selectedId.value = "";
        generated.value = null;
        saveToLibrary.value = false;
        newKeyName.value = "";
        loadError.value = "";
        void loadAvailableKeys();
    },
    { immediate: true },
);

watch(kind, () => {
    if (mode.value === "select") void loadAvailableKeys();
    else ensureGenerated();
});

watch(mode, (value) => {
    if (value === "generate") ensureGenerated();
    else void loadAvailableKeys();
});

const onLibraryUse = async (key: StoredKey) => {
    mode.value = "select";
    kind.value = key.kind;
    selectedId.value = key.id;
    libraryOpen.value = false;
    await loadAvailableKeys();
    selectedId.value = key.id; // keep the chosen key selected even after the list refresh
};

const onConfirm = async () => {
    if (!activeHex.value) return;
    const content = requestContent.value;
    const keyKind = kind.value;

    if (mode.value === "select") {
        const key = selectedKey.value;
        if (!key) return;
        emit('ok', {
            content,
            hex: key.hex,
            encoding: encoding.value,
            kind: key.kind,
            curve: key.curve,
            temporary: false,
            saved: true,
            name: key.name,
            source: "stored",
        });
        open.value = false;
        return;
    }

    const pair = generated.value;
    if (!pair) return;

    if (!saveToLibrary.value) {
        emit('ok', {
            content,
            hex: activeHex.value,
            encoding: encoding.value,
            kind: keyKind,
            curve: props.curve,
            temporary: true,
            saved: false,
            source: "generated",
        });
        open.value = false;
        return;
    }

    confirming.value = true;
    try {
        const name = newKeyName.value || defaultGeneratedName.value;
        const result = await saveGeneratedKeyPair(pair, name, props.curve);
        if (result.publicKeyError) {
            message.warning("Only the private key could be saved: " + result.publicKeyError);
        } else {
            message.success(
                result.publicKey ? `Saved "${name}" and its public key` : `Saved "${name}"`,
            );
        }
        emit('ok', {
            content,
            hex: activeHex.value,
            encoding: encoding.value,
            kind: keyKind,
            curve: props.curve,
            temporary: false,
            saved: true,
            name,
            source: "generated",
        });
        open.value = false;
    } catch (err) {
        message.error(err instanceof KeyStoreError ? err.message : String(err));
    } finally {
        confirming.value = false;
    }
};

const onCancel = () => {
    emit('cancel');
    open.value = false;
};
</script>

<style scoped>
.request {
    box-sizing: border-box;
    width: min(40em, 90vw);
    min-width: min(24em, 90vw);
}
.body {
    padding: 1em;
    display: flex;
    flex-direction: column;
    gap: 0.75em;
}
.hint {
    color: rgba(0, 0, 0, 0.45);
    font-size: 0.9em;
}
.format-row {
    display: flex;
    align-items: center;
    gap: 0.5em;
}
.format-label {
    font-weight: 600;
}
.state {
    padding: 1em 0;
    text-align: center;
    color: rgba(0, 0, 0, 0.45);
}
.key-list {
    display: flex;
    flex-direction: column;
    gap: 0.25em;
    max-height: 16em;
    overflow: auto;
    font-size: revert;
}
.key-option {
    display: flex;
    align-items: baseline;
    gap: 0.5em;
    white-space: normal;
}
.key-option-name {
    font-weight: 600;
}
.key-option-hex {
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    font-size: 0.85em;
    color: rgba(0, 0, 0, 0.65);
    overflow-wrap: anywhere;
}
.library-row {
    display: flex;
    justify-content: flex-start;
}
.footer {
    display: flex;
    justify-content: flex-end;
    gap: 0.5em;
}
@media (max-width: 560px) {
    .request {
        width: 100%;
        min-width: 0;
    }
}
</style>
