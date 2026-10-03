<template>
    <dialog-view v-if="open" v-model="open" class="confirm">
        <template #title>{{ title }}</template>

        <div class="message">{{ message }}</div>

        <template #footer>
            <div class="footer">
                <a-button :disabled="loading" @click="onCancel">{{ cancelText }}</a-button>
                <a-button type="primary" :danger="danger" :loading="loading" @click="onConfirm">{{ okText }}</a-button>
            </div>
        </template>
    </dialog-view>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { Button as AButton } from 'ant-design-vue';
import { DialogView } from 'vue-dialog-view';

const props = withDefaults(defineProps<{
    open?: boolean;
    title?: string;
    message?: string;
    okText?: string;
    cancelText?: string;
    /** Renders the confirm button as a destructive action. */
    danger?: boolean;
    /** Keeps the confirm button busy while the caller's action runs. */
    loading?: boolean;
}>(), {
    open: false,
    title: "Confirm",
    message: "",
    okText: "OK",
    cancelText: "Cancel",
    danger: false,
    loading: false,
});

const emit = defineEmits<{
    (e: 'update:open', value: boolean): void;
    (e: 'confirm'): void;
    (e: 'cancel'): void;
}>();

const open = computed({
    get: () => props.open,
    set: (value: boolean) => {
        emit('update:open', value);
    },
});

const onCancel = () => {
    emit('cancel');
    open.value = false;
};

const onConfirm = () => {
    emit('confirm');
};
</script>

<style scoped>
.confirm {
    box-sizing: border-box;
    width: min(28em, 90vw);
    min-width: min(20em, 90vw);
}
.message {
    white-space: pre-wrap;
    overflow-wrap: anywhere;
}
.footer {
    display: flex;
    justify-content: flex-end;
    gap: 0.5em;
}
</style>
