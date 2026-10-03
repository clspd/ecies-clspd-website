<template>
    <div class="key-editor">
        <a-form layout="vertical">
            <a-form-item label="Name">
                <a-input
                    v-model:value="name"
                    :maxlength="100"
                    placeholder="My key"
                    @press-enter="submit"
                />
            </a-form-item>

            <a-form-item label="Type">
                <a-radio-group v-model:value="kind">
                    <a-radio value="public">Public key (encrypt)</a-radio>
                    <a-radio value="private">Private key (decrypt)</a-radio>
                </a-radio-group>
            </a-form-item>

            <a-form-item label="Key content">
                <a-textarea
                    v-model:value="rawContent"
                    :auto-size="{ minRows: 2, maxRows: 6 }"
                    placeholder="Paste the key content"
                ></a-textarea>
                <div class="hint">Input encoding</div>
                <a-radio-group v-model:value="inputEncoding" size="small">
                    <a-radio-button v-for="option in encodingOptions" :key="option" :value="option">
                        {{ encodingLabels[option] }}
                    </a-radio-button>
                </a-radio-group>
                <div v-if="hex" class="hint">
                    Raw hex: <span class="mono">{{ hex }}</span>
                </div>
                <div v-else-if="validationError" class="error">{{ validationError }}</div>
            </a-form-item>

            <a-form-item>
                <a-checkbox v-model:checked="derivePublic" :disabled="kind !== 'private'">
                    Derive and use the public key of this private key
                </a-checkbox>
            </a-form-item>
        </a-form>

        <div class="actions">
            <a-button @click="emit('cancel')">Cancel</a-button>
            <a-button type="primary" :disabled="!hex || !!validationError" :loading="submitting" @click="submit">Save</a-button>
        </div>
    </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import {
    Button as AButton,
    Checkbox as ACheckbox,
    Form as AForm,
    FormItem as AFormItem,
    Input as AInput,
    Radio as ARadio,
    RadioButton as ARadioButton,
    RadioGroup as ARadioGroup,
    Textarea as ATextarea,
} from 'ant-design-vue';

import {
    KEY_ENCODINGS,
    KEY_ENCODING_LABELS,
    decodeToHex,
    isKeyEncoding,
    type KeyEncoding,
} from '@/utils/keyencoding';
import { validateKey, type KeyKind } from '@/utils/keys';

const props = withDefaults(defineProps<{
    initialName?: string;
    initialKind?: KeyKind;
    initialHex?: string;
    /** Prefills the key content field, e.g. when adding a key with a chosen encoding. */
    initialContent?: string;
    initialEncoding?: KeyEncoding;
    submitting?: boolean;
}>(), {
    initialName: "",
    initialKind: "private",
    initialHex: "",
    initialContent: "",
    initialEncoding: "hex",
    submitting: false,
});

const emit = defineEmits<{
    (e: 'submit', payload: { name: string; kind: KeyKind; hex: string; derivePublic: boolean }): void;
    (e: 'cancel'): void;
}>();

const encodingOptions = KEY_ENCODINGS;
const encodingLabels = KEY_ENCODING_LABELS;

const name = ref(props.initialName);
const kind = ref<KeyKind>(props.initialKind);
const rawContent = ref(props.initialContent || props.initialHex);
const inputEncoding = ref<KeyEncoding>(isKeyEncoding(props.initialEncoding) ? props.initialEncoding : "hex");
const derivePublic = ref(false);

const hex = computed(() => {
    const content = rawContent.value;
    if (!content) return "";
    try {
        return decodeToHex(content, inputEncoding.value);
    } catch {
        return "";
    }
});

const validationError = computed(() => {
    const content = rawContent.value;
    if (!content) return "Key content is empty";
    const decoded = hex.value;
    if (!decoded) return `Invalid ${encodingLabels[inputEncoding.value]} content`;
    const result = validateKey(kind.value, decoded);
    return result.ok ? "" : (result.reason ?? "Invalid key");
});

const submit = () => {
    if (!hex.value || validationError.value) return;
    emit('submit', { name: name.value, kind: kind.value, hex: hex.value, derivePublic: derivePublic.value });
};
</script>

<style scoped>
.hint {
    margin-top: 0.35em;
    color: rgba(0, 0, 0, 0.45);
    font-size: 0.85em;
}
.error {
    margin-top: 0.35em;
    color: #cf1322;
    font-size: 0.85em;
}
.mono {
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    word-break: break-all;
}
.actions {
    display: flex;
    justify-content: flex-end;
    gap: 0.5em;
}
</style>
