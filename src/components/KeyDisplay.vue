<template>
    <div class="key-display">
        <div class="head">
            <span class="label">{{ label }}</span>
            <span v-if="meta" class="meta">{{ meta }}</span>
        </div>
        <div class="row">
            <a-textarea
                class="value"
                :value="shownValue"
                :auto-size="{ minRows: 1, maxRows: 4 }"
                readonly
            />
            <a-button size="small" :disabled="!value" @click="copy">Copy</a-button>
            <a-button v-if="secret" size="small" @click="revealed = !revealed">
                {{ revealed ? "Hide" : "Reveal" }}
            </a-button>
        </div>
    </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { Button as AButton, Textarea as ATextarea, message } from 'ant-design-vue';

const props = withDefaults(defineProps<{
    /** The full value, e.g. the raw hex of the key. */
    value: string;
    label?: string;
    /** Displays the value masked until revealed. */
    secret?: boolean;
    /** Short helper text next to the label, e.g. the byte length. */
    meta?: string;
}>(), {
    label: "Key",
    secret: false,
    meta: "",
});

const emit = defineEmits<{
    (e: 'copied'): void;
}>();

const revealed = ref(false);

const shownValue = computed(() => {
    if (!props.secret || revealed.value) return props.value;
    return "•".repeat(Math.min(props.value.length || 0, 48));
});

const copy = async () => {
    if (!props.value) return;
    try {
        await navigator.clipboard.writeText(props.value);
        message.success(`${props.label} copied to clipboard`);
        emit('copied');
    } catch (err) {
        message.error("Cannot copy to clipboard: " + String(err));
    }
};
</script>

<style scoped>
.key-display {
    display: flex;
    flex-direction: column;
    gap: 0.25em;
}
.head {
    display: flex;
    align-items: baseline;
    gap: 0.5em;
}
.label {
    font-weight: 600;
}
.meta {
    color: rgba(0, 0, 0, 0.45);
    font-size: 0.85em;
}
.row {
    display: flex;
    align-items: flex-start;
    gap: 0.5em;
}
.row > .value {
    flex: 1;
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    font-size: 0.85em;
}
</style>
