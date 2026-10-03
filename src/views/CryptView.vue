<template>
    <div class="app">
        <header>
            <div class="header">Elliptic Curve Integrated Encryption Scheme</div>
        </header>

        <div class="body">
            <div class="nav-row">
                <a-button @click="openKeyLibrary">Edit My Keys</a-button>
            </div>

            <a-card :title="'1. Select action'" size="small">
                <a-radio-group v-model:value="page_state.action">
                    <a-radio value="encrypt">Encrypt</a-radio>
                    <a-radio value="decrypt">Decrypt</a-radio>
                </a-radio-group>
            </a-card>

            <a-card :title="'2. Input content'" size="small">
                <a-textarea v-model:value="page_state.input" auto-size placeholder="Input content to encrypt or decrypt"></a-textarea>
            </a-card>

            <a-card :title="'3. Key content'" size="small">
                <div class="key-row">
                    <a-input class="content" v-model:value="page_state.keyContent" placeholder="Key content for encryption or decryption"></a-input>
                    <a-button @click="() => void requestUserKey()">Choose…</a-button>
                </div>
            </a-card>

            <a-card :title="'4. Key encoding'" size="small">
                <a-radio-group v-model:value="page_state.keyEncoding">
                    <a-radio value="hex">Hex</a-radio>
                    <a-radio value="base64">Base64</a-radio>
                    <a-radio value="base58">Base58</a-radio>
                    <a-radio value="lz-string">LZ-String</a-radio>
                </a-radio-group>
            </a-card>

            <a-card :title="'5. Action & Output'" size="small">
                <div class="action-row">
                    <a-button @click="performAction" type="primary">Perform Action</a-button>
                    <a-button @click="copyOutput">Copy Output</a-button>
                    <a-button @click="page_state.output = ''" type="dashed">Clear Output</a-button>
                    <a-button @click="page_state.input = ''" type="dashed" danger>Clear Input</a-button>
                </div>
                <a-textarea v-model:value="page_state.output" :auto-size="page_state.action === 'decrypt'" :rows="page_state.action === 'decrypt' ? undefined : 4" placeholder="Output content after encryption or decryption" readonly></a-textarea>
            </a-card>

            <a-card :title="'Credits'" size="small">
                <a-button @click="openCredits">Credits</a-button>
                <CreditsView v-model:open="creditsOpen" />
            </a-card>
        </div>

        <KeyRequestDialog
            v-model:open="keyRequestOpen"
            :kind="keyRequestKind"
            :encoding="page_state.keyEncoding"
            @ok="onKeyRequestOk"
        />
        <KeyLibraryDialog v-model:open="keyLibraryOpen" />

        <dialog-view v-model="showProgressDialog">
            <template #title>Processing...</template>
            <div>Please wait while the action is being performed.</div>
        </dialog-view>
    </div>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import { Button as AButton, Card as ACard, Textarea as ATextarea, Input as AInput, Radio as ARadio, RadioGroup as ARadioGroup, message } from 'ant-design-vue';
import { encrypt, decrypt } from 'eciesjs';
import { DialogView } from 'vue-dialog-view';
import CreditsView from '@/components/CreditsView.vue';
import KeyLibraryDialog from '@/components/KeyLibraryDialog.vue';
import KeyRequestDialog, { type KeyRequestResult } from '@/components/KeyRequestDialog.vue';
import { decodeBase64, decodeBytes, type KeyEncoding } from '@/utils/keyencoding';
import { type KeyKind } from '@/utils/keys';

const props = withDefaults(defineProps<{
    action?: "encrypt" | "decrypt";
    keyContent?: string;
    keyEncoding?: KeyEncoding;
    input?: string;
}>(), {
    keyContent: "",
    input: "",
});

const page_state = reactive({
    action: "encrypt" as "encrypt" | "decrypt",
    keyContent: "",
    keyEncoding: "hex" as KeyEncoding,
    input: "",
    output: "",
});

const getKeyBytes = (keyContent: string, encoding: KeyEncoding = page_state.keyEncoding) => decodeBytes(keyContent, encoding);

const updateFromProps = () => {
    if (props.action) page_state.action = props.action;
    if (props.keyContent) try { getKeyBytes(props.keyContent, props.keyEncoding ?? page_state.keyEncoding); page_state.keyContent = props.keyContent; } catch {}
    if (props.keyEncoding) page_state.keyEncoding = props.keyEncoding;
    // if (props.input) page_state.input = props.input; // default not enabled due to possible content security problems
};

watch(() => [props.action, props.keyContent, props.keyEncoding, props.input], () => {
    updateFromProps();
}, { immediate: true });

const creditsOpen = ref(false);

const openCredits = () => {
    creditsOpen.value = true;
};

const keyLibraryOpen = ref(false);

const openKeyLibrary = () => {
    keyLibraryOpen.value = true;
};

const keyRequestOpen = ref(false);
const keyRequestKind = computed<KeyKind>(() => (page_state.action === "encrypt" ? "public" : "private"));
let pendingKeyRequest: ((result: KeyRequestResult | null) => void) | null = null;

const resolveKeyRequest = (result: KeyRequestResult | null) => {
    const resolve = pendingKeyRequest;
    pendingKeyRequest = null;
    if (resolve) resolve(result);
};

const requestUserKey = (): Promise<KeyRequestResult | null> => {
    resolveKeyRequest(null);
    keyRequestOpen.value = true;
    return new Promise<KeyRequestResult | null>((resolve) => {
        pendingKeyRequest = resolve;
    });
};

const onKeyRequestOk = (result: KeyRequestResult) => {
    page_state.keyContent = result.content;
    page_state.keyEncoding = result.encoding;
    resolveKeyRequest(result);
};

const copyOutput = () => {
    if (page_state.output) {
        navigator.clipboard.writeText(page_state.output).then(() => {
            message.success("Output copied to clipboard");
        }).catch((err) => {
            message.error("Cannot copy output to clipboard: " + err);
        });
    } else {
        message.error("No output to copy");
    }
};

const showProgressDialog = ref(false);

const performAction = async () => {
    if (!page_state.keyContent) {
        message.error("Key content is empty");
        return;
    }
    if (!page_state.input) {
        message.error("Input content is empty");
        return;
    }

    showProgressDialog.value = true;

    try {
        const keyBytes = getKeyBytes(page_state.keyContent);
        if (page_state.action === "encrypt") {
            const ciphered = encrypt(keyBytes, new TextEncoder().encode(page_state.input));
            page_state.output = btoa(ciphered.reduce((text, byte) => text + String.fromCharCode(byte), ""));
        } else {
            const ciphered = decodeBase64(page_state.input);
            page_state.output = new TextDecoder().decode(decrypt(keyBytes, ciphered));
        }
    } catch (err) {
        message.error("Error during action: " + err);
    } finally {
        showProgressDialog.value = false;
    }
};
</script>

<style scoped>
.app {
    padding: 1em;
}
.header {
    text-align: center;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    font-weight: bold;
    font-size: 1.5em;
    margin-bottom: 0.5em;
}
.body > :not(:last-child) {
    margin-bottom: .5em;
}
.key-row {
    display: flex;
    gap: 0.5em;
}
.key-row > .content {
    flex: 1;
}
.action-row {
    margin-bottom: .5em;
    display: flex;
    flex-direction: row;
    flex-wrap: wrap;
    gap: 0.5em;
}
</style>
