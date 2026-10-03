<template>
    <dialog-view v-model="open" class="library">
        <template #title>My key library</template>

        <div class="body">
            <div class="toolbar">
                <a-input
                    v-model:value="search"
                    allow-clear
                    class="search"
                    placeholder="Search by name or key content"
                />
                <a-segmented v-model:value="kindFilter" :options="kindFilterOptions" />
            </div>
            <div class="toolbar">
                <a-button @click="revealKeys = !revealKeys">{{ revealKeys ? "Hide keys" : "Reveal keys" }}</a-button>
                <a-button :loading="generating" :disabled="showEditor" @click="generateKeys">Generate new key</a-button>
                <a-button type="primary" :disabled="showEditor" @click="startAdd">Add key</a-button>
            </div>

            <a-alert
                v-if="loadError"
                type="error"
                show-icon
                :message="loadError"
                class="notice"
            >
                <template #action>
                    <a-button size="small" @click="reload">Retry</a-button>
                </template>
            </a-alert>

            <a-alert
                v-else
                type="warning"
                show-icon
                class="notice"
                message="Keys are stored unencrypted in this browser's IndexedDB. Only use this library on a device you trust."
            />

            <key-editor-form
                v-if="showEditor"
                :key="editorSeed"
                :initial-name="editor.name"
                :initial-kind="editor.kind"
                :initial-hex="editor.hex"
                :curve="editor.curve"
                :submitting="editorBusy"
                @submit="onEditorSubmit"
                @cancel="showEditor = false"
            />

            <div v-if="loading" class="state">Loading your keys…</div>
            <a-empty v-else-if="!keys.length" class="state" description="No keys match the current filter" />

            <a-list v-else item-layout="vertical" size="small" :data-source="keys">
                <template #renderItem="{ item }">
                    <a-list-item>
                        <div class="key-row">
                            <div class="key-info">
                                <div class="key-name">
                                    {{ item.name }}
                                    <a-tag :color="item.kind === 'private' ? 'red' : 'blue'">
                                        {{ item.kind === 'private' ? 'Private' : 'Public' }}
                                    </a-tag>
                                </div>
                                <div class="key-hex" :title="item.hex">
                                    {{ revealKeys ? item.hex : maskKey(item.hex) }}
                                </div>
                                <div class="key-meta">
                                    {{ item.hex.length / 2 }} bytes · updated {{ formatTime(item.updatedAt) }}
                                </div>
                            </div>
                            <div class="key-actions">
                                <a-button v-if="requestOpen" size="small" @click="useKey(item)">Use</a-button>
                                <a-button size="small" @click="copyKey(item)">Copy</a-button>
                                <a-button size="small" @click="startEdit(item)">Edit</a-button>
                                <a-button size="small" danger @click="askDelete(item)">Delete</a-button>
                            </div>
                        </div>
                    </a-list-item>
                </template>
            </a-list>
        </div>

        <confirm-dialog
            v-model:open="deleteConfirmOpen"
            danger
            :loading="deleting"
            title="Delete key"
            :message="deleteMessage"
            ok-text="Delete"
            cancel-text="Cancel"
            @confirm="confirmDelete"
            @cancel="deleteTarget = null"
        />
    </dialog-view>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import {
    Alert as AAlert,
    Button as AButton,
    Empty as AEmpty,
    Input as AInput,
    List as AList,
    ListItem as AListItem,
    Segmented as ASegmented,
    Tag as ATag,
    message,
} from 'ant-design-vue';
import { DialogView } from 'vue-dialog-view';

import ConfirmDialog from '@/components/ConfirmDialog.vue';
import KeyEditorForm from '@/components/KeyEditorForm.vue';
import {
    deleteKey,
    listKeys,
    renameKey,
    saveGeneratedKeyPair,
    saveKey,
    type StoredKey,
} from '@/utils/keystore';
import { derivePublicHex, generateKeyPair, type KeyKind } from '@/utils/keys';
import { DEFAULT_CURVE, isCurve, type Curve } from '@/utils/cryptoconfig';

const props = withDefaults(defineProps<{
    open?: boolean;
    /** True when the library is opened from the key request dialog. */
    requestOpen?: boolean;
    curve?: Curve;
}>(), {
    open: false,
    requestOpen: false,
    curve: DEFAULT_CURVE,
});

const emit = defineEmits<{
    (e: 'update:open', value: boolean): void;
    (e: 'saved', key: StoredKey): void;
    (e: 'changed'): void;
    (e: 'use', key: StoredKey): void;
}>();

const open = computed({
    get: () => props.open,
    set: (value: boolean) => {
        emit('update:open', value);
    },
});

type KindFilter = "all" | KeyKind;

const keys = ref<StoredKey[]>([]);
const search = ref("");
const kindFilter = ref<KindFilter>("all");
const revealKeys = ref(false);
const loading = ref(false);
const loadError = ref("");

const kindFilterOptions: { label: string; value: KindFilter }[] = [
    { label: "All", value: "all" },
    { label: "Public", value: "public" },
    { label: "Private", value: "private" },
];

const editor = reactive({
    name: "",
    kind: "private" as KeyKind,
    hex: "",
    curve: DEFAULT_CURVE as Curve,
});
const showEditor = ref(false);
const editorBusy = ref(false);
const editorSeed = ref(0);
const editingId = ref("");
const generating = ref(false);
const deleteTarget = ref<StoredKey | null>(null);
const deleteConfirmOpen = ref(false);
const deleting = ref(false);

const deleteMessage = computed(() =>
    deleteTarget.value
        ? `Delete "${deleteTarget.value.name}" from your key library? This cannot be undone.`
        : "Delete this key from your key library? This cannot be undone.",
);

const askDelete = (key: StoredKey) => {
    deleteTarget.value = key;
    deleteConfirmOpen.value = true;
};

const useKey = (key: StoredKey) => {
    emit('use', key);
    emit('saved', key); // lets a hosting dialog refresh its own key list
};

const confirmDelete = async () => {
    const key = deleteTarget.value;
    if (!key) return;
    deleting.value = true;
    try {
        await deleteKey(key.id);
        message.success(`Deleted "${key.name}"`);
        emit('changed');
        deleteConfirmOpen.value = false;
        deleteTarget.value = null;
        await reload();
    } catch (err) {
        message.error(err instanceof Error ? err.message : String(err));
    } finally {
        deleting.value = false;
    }
};

/** Generates a fresh key pair and stores both halves in the library. */
const generateKeys = async () => {
    generating.value = true;
    try {
        const pair = generateKeyPair(props.curve);
        const result = await saveGeneratedKeyPair(pair, undefined, props.curve);
        message.success(
            result.publicKey
                ? `Generated a new key pair: "${result.privateKey.name}" and "${result.publicKey.name}"`
                : `Generated "${result.privateKey.name}"`,
        );
        if (result.publicKeyError) {
            message.warning("Only the private key could be saved: " + result.publicKeyError);
        }
        emit('saved', result.privateKey);
        emit('changed');
        await reload();
    } catch (err) {
        message.error(err instanceof Error ? err.message : String(err));
    } finally {
        generating.value = false;
    }
};

const reload = async () => {
    loading.value = true;
    loadError.value = "";
    try {
        keys.value = await listKeys({
            kind: kindFilter.value === "all" ? undefined : kindFilter.value,
            search: search.value,
        });
    } catch (err) {
        keys.value = [];
        loadError.value = err instanceof Error ? err.message : String(err);
    } finally {
        loading.value = false;
    }
};

watch(
    () => [props.open, kindFilter.value, search.value] as const,
    ([isOpen]) => {
        if (!isOpen) return;
        void reload();
    },
    { immediate: true },
);

const startAdd = () => {
    editor.name = "";
    editor.kind = "private";
    editor.hex = "";
    editor.curve = props.curve;
    editingId.value = "";
    editorSeed.value++;
    showEditor.value = true;
};

const startEdit = (key: StoredKey) => {
    editor.name = key.name;
    editor.kind = key.kind;
    editor.hex = key.hex;
    editor.curve = isCurve(key.curve) ? key.curve : props.curve;
    editingId.value = key.id;
    editorSeed.value++;
    showEditor.value = true;
};

const defaultNameFor = (kind: KeyKind): string => {
    const stamp = new Date().toISOString().replace("T", " ").slice(0, 19);
    return `${kind === "private" ? "Private" : "Public"} key ${stamp}`;
};

const onEditorSubmit = async (payload: { name: string; kind: KeyKind; hex: string; derivePublic: boolean }) => {
    editorBusy.value = true;
    const name = payload.name || defaultNameFor(payload.kind);
    const id = editingId.value;
    try {
        const saved = await saveKey({ id: id || undefined, name, kind: payload.kind, hex: payload.hex, curve: editor.curve });
        message.success(id ? `Updated "${saved.name}"` : `Saved "${saved.name}" to your key library`);
        emit('saved', saved);
        emit('changed');

        if (payload.derivePublic && payload.kind === "private") {
            try {
                const publicHex = derivePublicHex(payload.hex, editor.curve);
                await saveKey({ name: `${name} (public)`, kind: "public", hex: publicHex, curve: editor.curve });
                message.success("The matching public key was added to your key library");
            } catch (err) {
                message.warning("The private key was saved, but its public key was not: " + String(err));
            }
        }
        showEditor.value = false;
        editingId.value = "";
        await reload();
    } catch (err) {
        message.error(err instanceof Error ? err.message : String(err));
    } finally {
        editorBusy.value = false;
    }
};

const copyKey = async (key: StoredKey) => {
    try {
        await navigator.clipboard.writeText(key.hex);
        message.success("Key copied to clipboard");
    } catch (err) {
        message.error("Cannot copy to clipboard: " + String(err));
    }
};

const maskKey = (hex: string): string => {
    if (hex.length <= 18) return hex;
    return hex.slice(0, 10) + "…" + hex.slice(-8);
};

const formatTime = (timestamp: number): string => new Date(timestamp).toLocaleString();
</script>

<style scoped>
.library {
    box-sizing: border-box;
    width: min(48em, 90vw);
    min-width: min(24em, 90vw);
}
.body {
    padding: 1em;
    display: flex;
    flex-direction: column;
    gap: 0.75em;
}
.toolbar {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5em;
}
.toolbar > .search {
    flex: 1 1 10em;
    min-width: 8em;
}
.notice {
    white-space: pre-wrap;
}
.state {
    padding: 1em 0;
    text-align: center;
    color: rgba(0, 0, 0, 0.45);
}
.key-row {
    display: flex;
    flex-wrap: wrap;
    width: 100%;
    align-items: flex-start;
    gap: 0.75em;
}
.key-info {
    flex: 1 1 22em;
    min-width: 0;
}
.key-name {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.5em;
    font-weight: 600;
    overflow-wrap: anywhere;
}
.key-hex,
.key-meta {
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    font-size: 0.85em;
    color: rgba(0, 0, 0, 0.65);
    overflow-wrap: anywhere;
}
.key-actions {
    display: flex;
    flex: 0 0 auto;
    flex-wrap: wrap;
    gap: 0.35em;
}
@media (max-width: 560px) {
    .library {
        width: 100%;
        min-width: 0;
    }
    .key-info,
    .key-actions {
        flex: 1 1 100%;
    }
}
</style>
